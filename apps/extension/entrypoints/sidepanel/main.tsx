import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, BellOff, ChevronLeft, ChevronRight, Clipboard, Download, Eye, RotateCcw, ScanLine, ShieldCheck, Square, Trash2 } from "lucide-react";
import { runWorkerScan, SCAN_LIMITS, type PageExtractionResult } from "@agentsafe/browser-scanner-adapter";
import { summarizeFindings } from "@agentsafe/risk-engine";
import {
  defaultSettings,
  type Finding,
  type SanitizedExport,
  type ScanProgress,
  type ScanResult,
  type ScannerSettings,
  type ScopedException,
  type Severity
} from "@agentsafe/shared-types";
import { createSanitizedExport } from "@agentsafe/markdown-exporter";
import { analyzeWebMcpTools, exportWebMcpReportJson, exportWebMcpReportMarkdown, type WebMcpSecurityReport } from "@agentsafe/webmcp-security";
import "./style.css";

type Tab = "summary" | "findings" | "hidden" | "webmcp" | "sanitized" | "export" | "settings";

interface PageSnapshot {
  html: string;
  url: string;
  title: string;
}

interface CachedScan {
  scan: ScanResult;
  report: SanitizedExport;
  webMcpReport?: WebMcpSecurityReport;
  scannedAt: string;
  source: "manual" | "auto";
}

const tabs: Array<[Tab, string]> = [
  ["summary", "Summary"],
  ["findings", "Findings"],
  ["hidden", "Hidden Content"],
  ["webmcp", "WebMCP"],
  ["sanitized", "Sanitized Content"],
  ["export", "Export"],
  ["settings", "Settings"]
];

function App() {
  const [tab, setTab] = useState<Tab>("summary");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [report, setReport] = useState<SanitizedExport | null>(null);
  const [webMcpReport, setWebMcpReport] = useState<WebMcpSecurityReport | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activeFinding, setActiveFinding] = useState(0);
  const [status, setStatus] = useState("Ready. Scanning only runs when you press Scan.");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const activeScan = useRef<{ scanId: string; controller: AbortController; tabId: number } | null>(null);
  const visibleTabId = useRef<number | null>(null);

  useEffect(() => {
    chrome.storage.local.get(["agentsafe.settings"]).then((value) => {
      setSettings({ ...defaultSettings, ...(value["agentsafe.settings"] ?? {}) });
      setSettingsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    void chrome.storage.local.set({ "agentsafe.settings": settings });
  }, [settings, settingsLoaded]);

  useEffect(() => {
    void loadCachedResult();
  }, []);

  useEffect(() => {
    const handleActivated = () => {
      void loadCachedResult();
    };
    const handleUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status !== "complete" || !settings.autoScanEnabled) return;
      window.setTimeout(() => {
        void runAutoScanForTab(tabId);
      }, settings.autoScanDelayMs);
    };
    chrome.tabs.onActivated.addListener(handleActivated);
    chrome.tabs.onUpdated.addListener(handleUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, [settings.autoScanEnabled, settings.autoScanDelayMs, settings.badgeEnabled, settings.sensitivity, settings.enabledCategories, settings.includeAriaHidden, settings.phraseAllowlist, settings.domainAllowlist, settings.scopedExceptions, settings.scanMode]);

  const findings = scan?.findings ?? [];
  const selected = findings[activeFinding];
  const hiddenFindings = findings.filter((finding) => !finding.visibleToUser);

  async function currentTab() {
    const [tabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabInfo?.id) throw new Error("No active tab available.");
    visibleTabId.current = tabInfo.id;
    return tabInfo;
  }

  async function runScan(source: "manual" | "auto" = "manual") {
    if (activeScan.current) cancelScan();
    const scanId = crypto.randomUUID();
    const controller = new AbortController();
    let startedTabId: number | null = null;
    setIsScanning(true);
    setProgress(initialScanProgress(scanId, settings.scanMode, source === "auto" ? "auto_scan_pending" : "preparing_scan", 2));
    setStatus(source === "auto" ? "Auto-scanning this page locally..." : `Preparing ${settings.scanMode} scan...`);
    await chrome.storage.local.set({ "agentsafe.settings": settings });
    try {
      const tabInfo = await currentTab();
      startedTabId = tabInfo.id!;
      if (isDomainAllowedForAgentSafe(tabInfo.url ?? "", settings.domainAllowlist)) {
        setScan(null);
        setReport(null);
        setWebMcpReport(null);
        await chrome.action.setBadgeText({ tabId: tabInfo.id!, text: "" });
        if (isVisibleTab(tabInfo.id!)) setStatus("Scan skipped because this domain is in the allowlist.");
        return;
      }
      activeScan.current = { scanId, controller, tabId: tabInfo.id! };
      setProgress(initialScanProgress(scanId, settings.scanMode, "extracting_page_text", 6));
      setStatus("Extracting page text locally...");
      const extractionResult = await executeWithPageAccess(
        tabInfo,
        collectTextSegmentsForAgentSafe,
        [scanId, settings.scanMode, settings.phraseAllowlist, settings.includeAriaHidden],
        { requestPermission: source === "manual", allFrames: true }
      );
      if (controller.signal.aborted) throw new Error("Scan cancelled.");
      const extraction = mergeFrameExtractions(extractionResult, SCAN_LIMITS[settings.scanMode].maxTotalCharacters);
      setProgress({
        ...initialScanProgress(scanId, settings.scanMode, "queueing_worker_chunks", 10),
        nodesVisited: extraction.metrics.nodesVisited,
        charactersExtracted: extraction.metrics.charactersExtracted
      });
      setStatus(`Scanning ${extraction.segments.length} extracted text segments in a Worker...`);
      const workerResult = await runWorkerScan({
        scanId,
        pageUrl: extraction.pageUrl,
        pageTitle: extraction.pageTitle,
        settings,
        segments: extraction.segments,
        extractionMetrics: extraction.metrics,
        signal: controller.signal,
        onProgress: (nextProgress) => {
          if (activeScan.current?.scanId !== nextProgress.scanId) return;
          if (!isVisibleTab(tabInfo.id!)) return;
          setProgress(nextProgress);
          setStatus(`${nextProgress.phase.replaceAll("_", " ")}: ${nextProgress.chunksCompleted}/${nextProgress.totalEstimatedChunks} chunks, ${nextProgress.findingsCount} findings.`);
        }
      });
      if (controller.signal.aborted) throw new Error("Scan cancelled.");
      const snapshotInjection = await executeWithPageAccess(tabInfo, snapshotPageForAgentSafe, undefined, { requestPermission: false });
      const pageSnapshot = snapshotInjection[0]?.result as PageSnapshot | undefined;
      if (!pageSnapshot) throw new Error("Could not read page content for export.");
      const parsed = new DOMParser().parseFromString(pageSnapshot.html, "text/html");
      Object.defineProperty(parsed, "title", { value: pageSnapshot.title, configurable: true });
      const nextScan: ScanResult = {
        context: {
          url: extraction.pageUrl,
          title: extraction.pageTitle,
          scannedAt: new Date().toISOString(),
          settings
        },
        findings: workerResult.findings,
        summary: summarizeFindings(workerResult.findings),
        metadata: workerResult.metrics
      };
      const nextReport = createSanitizedExport(parsed, nextScan.findings);
      nextReport.sourceUrl = extraction.pageUrl;
      nextReport.pageTitle = extraction.pageTitle;
      const webMcpSnapshot = settings.experimentalWebMcpSecurity
        ? await executeWithPageAccess(tabInfo, collectWebMcpForAgentSafe, undefined, { requestPermission: source === "manual" })
        : [];
      const webMcpPage = webMcpSnapshot[0]?.result as ReturnType<typeof collectWebMcpForAgentSafe> | undefined;
      const nextWebMcpReport = settings.experimentalWebMcpSecurity && webMcpPage
        ? await analyzeWebMcpTools({
            pageUrl: webMcpPage.pageUrl,
            browserSupport: webMcpPage.support,
            tools: webMcpPage.tools,
            agentSafeVersion: chrome.runtime.getManifest().version
          })
        : null;
      await saveCachedResult(tabInfo.id!, nextScan, nextReport, source, nextWebMcpReport ?? undefined);
      await updateBadge(tabInfo.id!, nextScan, settings.badgeEnabled);
      if (isVisibleTab(tabInfo.id!)) {
        setScan(nextScan);
        setReport(nextReport);
        setWebMcpReport(nextWebMcpReport);
        setActiveFinding(0);
        setStatus(`${scanStatusText(workerResult.status)}: ${nextScan.findings.length} page findings, ${nextWebMcpReport?.tools.length ?? 0} WebMCP tools.`);
      }
    } catch (error) {
      if (isVisibleTab(activeScan.current?.tabId ?? null)) {
        if (formatScanError(error).includes("cancelled")) {
          setStatus("Scan cancelled. Findings shown were detected before cancellation.");
        } else if (source === "manual") {
          setStatus(`Scan failed. ${formatScanError(error)}`);
        }
      }
    } finally {
      if (activeScan.current?.scanId === scanId) activeScan.current = null;
      if (isVisibleTab(startedTabId)) {
        setIsScanning(false);
        // Leaving the meter up after the scan settles reads as a stuck scan: it
        // freezes at whatever percentage the last chunk reported. Completion
        // detail belongs to the summary, which reports it accurately.
        setProgress(null);
      }
    }
  }

  function isVisibleTab(tabId: number | null): boolean {
    return tabId !== null && visibleTabId.current === tabId;
  }

  function cancelScan() {
    const scan = activeScan.current;
    if (!scan) return;
    scan.controller.abort();
    setIsScanning(false);
    setStatus("Cancelling scan...");
    void chrome.tabs
      .get(scan.tabId)
      .then((tabInfo) =>
        executeWithPageAccess(tabInfo, cancelTextExtractionForAgentSafe, [scan.scanId], { requestPermission: false, allFrames: true })
      )
      .catch(() => undefined);
  }

  async function runAutoScanForTab(tabId: number) {
    const tabInfo = await chrome.tabs.get(tabId);
    if (!tabInfo.active) return;
    const origin = originPattern(tabInfo.url);
    if (origin) {
      const granted = await chrome.permissions.contains({ origins: [origin] });
      if (!granted) {
        if (settings.badgeEnabled) await chrome.action.setBadgeText({ tabId, text: "" });
        setStatus("Auto-scan skipped. Use Scan once on this site to grant access.");
        return;
      }
    }
    await runScan("auto");
  }

  async function loadCachedResult() {
    const tabInfo = await currentTab().catch(() => null);
    if (!tabInfo?.id) return;
    if (activeScan.current?.tabId === tabInfo.id) {
      setIsScanning(true);
      setStatus("Scan running on this tab...");
    } else {
      setIsScanning(false);
      setProgress(null);
    }
    const key = cacheKey(tabInfo.id);
    const stored = await chrome.storage.session.get([key]);
    const cached = stored[key] as CachedScan | undefined;
    if (!cached) {
      if (activeScan.current?.tabId !== tabInfo.id) {
        setScan(null);
        setReport(null);
        setWebMcpReport(null);
        setActiveFinding(0);
        setStatus("Ready. Scanning only runs when you press Scan.");
      }
      return;
    }
    setScan(cached.scan);
    setReport(cached.report);
    setWebMcpReport(cached.webMcpReport ?? null);
    setActiveFinding(0);
    if (activeScan.current?.tabId !== tabInfo.id) setStatus(`Loaded ${cached.source} scan from ${new Date(cached.scannedAt).toLocaleTimeString()}: ${cached.scan.findings.length} findings.`);
  }

  // These run against the page, so they can fail for reasons the user needs to
  // see: a revoked permission, a browser-internal tab, or a page that navigated
  // away. Reporting beats an unhandled rejection and a button that does nothing.
  async function withPageAction(action: string, run: () => Promise<unknown>) {
    try {
      await run();
    } catch (error) {
      setStatus(`Could not ${action}. ${formatScanError(error)}`);
    }
  }

  async function highlight(finding: Finding | undefined) {
    if (!finding) return;
    await withPageAction("highlight this finding", async () =>
      executeWithPageAccess(await currentTab(), applyAgentSafePageAction, ["highlight", finding.selector, finding.frameUrl ?? ""] as const, {
        allFrames: true
      })
    );
  }

  async function reveal(finding: Finding | undefined) {
    if (!finding) return;
    await withPageAction("reveal this content", async () =>
      executeWithPageAccess(await currentTab(), applyAgentSafePageAction, ["reveal", finding.selector, finding.frameUrl ?? ""] as const, {
        allFrames: true
      })
    );
  }

  async function clear() {
    await withPageAction("clear highlights", async () =>
      executeWithPageAccess(await currentTab(), applyAgentSafePageAction, ["clear", "", ""] as const, { allFrames: true })
    );
  }

  function next(delta: number) {
    if (findings.length === 0) return;
    setActiveFinding((current) => (current + delta + findings.length) % findings.length);
  }

  /**
   * Writes a rule-scoped exception for the current host and applies it to the
   * result already on screen. Editing the exceptions JSON by hand and rescanning
   * was the only way to silence a false positive, which is too much friction for
   * the thing users need most often.
   */
  async function ignoreRuleForSite(finding: Finding) {
    const host = hostnameForAgentSafe(scan?.context.url ?? "");
    if (!host) {
      setStatus("This page has no host name to scope an exception to.");
      return;
    }
    const exception: ScopedException = {
      id: crypto.randomUUID(),
      scopeType: "exact-hostname",
      scopeValue: host,
      ruleIds: [finding.ruleId],
      enabled: true,
      createdAt: new Date().toISOString(),
      source: "user",
      note: `Ignored ${finding.ruleId} on ${host} from a finding.`
    };
    const nextSettings: ScannerSettings = { ...settings, scopedExceptions: [...settings.scopedExceptions, exception] };
    setSettings(nextSettings);
    if (!scan) return;

    const remaining = scan.findings.filter((candidate) => candidate.ruleId !== finding.ruleId);
    const nextScan: ScanResult = {
      ...scan,
      findings: remaining,
      summary: summarizeFindings(remaining),
      context: { ...scan.context, settings: nextSettings }
    };
    const nextReport = report ? { ...report, findings: remaining } : null;
    setScan(nextScan);
    setReport(nextReport);
    setActiveFinding(0);
    setStatus(`Ignoring ${finding.ruleId} on ${host}. ${remaining.length} findings remain. Undo in Settings.`);

    const tabId = visibleTabId.current;
    if (tabId !== null && nextReport) {
      await saveCachedResult(tabId, nextScan, nextReport, "manual", webMcpReport ?? undefined);
      await updateBadge(tabId, nextScan, nextSettings.badgeEnabled);
    }
  }

  return (
    <main>
      <header>
        <div>
          <h1>AgentSafe</h1>
          <p>Prompt Injection Detector</p>
        </div>
      </header>

      <nav>
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      <ScanControls isScanning={isScanning} mode={settings.scanMode} status={status} progress={progress} onScan={() => runScan("manual")} onCancel={cancelScan} />

      {tab === "summary" && <Summary scan={scan} />}
      {tab === "findings" && (
        <Findings
          findings={findings}
          selected={selected}
          activeFinding={activeFinding}
          next={next}
          select={setActiveFinding}
          highlight={highlight}
          reveal={reveal}
          clear={clear}
          onIgnoreRule={ignoreRuleForSite}
        />
      )}
      {tab === "hidden" && <FindingList title="Hidden Content" findings={hiddenFindings} onHighlight={highlight} onReveal={reveal} onIgnoreRule={ignoreRuleForSite} />}
      {tab === "webmcp" && <WebMcpSecurity report={webMcpReport} enabled={settings.experimentalWebMcpSecurity} />}
      {tab === "sanitized" && <Sanitized report={report} />}
      {tab === "export" && <Export report={report} scan={scan} />}
      {tab === "settings" && <Settings settings={settings} setSettings={setSettings} />}
    </main>
  );
}

function ScanControls(props: {
  isScanning: boolean;
  mode: ScannerSettings["scanMode"];
  status: string;
  progress: ScanProgress | null;
  onScan(): void;
  onCancel(): void;
}) {
  return (
    <section className="scan-controls">
      <div className="scan-actions">
        <button className="primary" onClick={props.onScan} disabled={props.isScanning} title="Scan current page">
          <ScanLine size={17} /> Scan
        </button>
        <button onClick={props.onCancel} disabled={!props.isScanning} title="Cancel current scan">
          <Square size={16} /> Cancel
        </button>
        <span>{props.mode} mode</span>
      </div>
      <p className={`status ${props.isScanning ? "active" : ""}`}>{props.status}</p>
      {(props.progress || props.isScanning) && (
        <ProgressMeter progress={props.progress ?? initialScanProgress("pending", props.mode, "preparing_scan", 1)} />
      )}
    </section>
  );
}

function ProgressMeter({ progress }: { progress: ScanProgress }) {
  return (
    <section className="progress-panel">
      <div className="progress-row">
        <strong>{progress.percentage ?? 0}%</strong>
        <span>{progress.currentScanMode} - {progress.phase.replaceAll("_", " ")}</span>
      </div>
      <progress max={100} value={progress.percentage ?? 0} />
      <div className="grid">
        <div className="metric"><strong>{progress.charactersScanned}</strong><span>chars scanned</span></div>
        <div className="metric"><strong>{progress.chunksCompleted}/{progress.totalEstimatedChunks}</strong><span>chunks</span></div>
      </div>
    </section>
  );
}

function initialScanProgress(scanId: string, mode: ScannerSettings["scanMode"], phase: string, percentage: number): ScanProgress {
  return {
    scanId,
    phase,
    status: "running",
    percentage,
    nodesVisited: 0,
    charactersExtracted: 0,
    charactersScanned: 0,
    chunksQueued: 0,
    chunksCompleted: 0,
    totalEstimatedChunks: 0,
    findingsCount: 0,
    elapsedMs: 0,
    workerRestartCount: 0,
    currentScanMode: mode
  };
}

function Summary({ scan }: { scan: ScanResult | null }) {
  const severities: Severity[] = ["critical", "high", "medium", "low", "informational"];
  const metadata = scan?.metadata;
  return (
    <section>
      <div className="score">
        <AlertTriangle size={22} />
        <span>{scan?.summary.overallRiskScore ?? 0}</span>
        <small>overall risk</small>
      </div>
      <div className="grid">
        {severities.map((severity) => (
          <div className="metric" key={severity}>
            <strong>{scan?.summary.severityCounts[severity] ?? 0}</strong>
            <span>{severity}</span>
          </div>
        ))}
      </div>
      <div className="grid">
        <div className="metric"><strong>{scan?.summary.hiddenTextCount ?? 0}</strong><span>hidden text</span></div>
        <div className="metric"><strong>{scan?.summary.suspiciousUnicodeCount ?? 0}</strong><span>unicode</span></div>
        <div className="metric"><strong>{scan?.summary.instructionPatternCount ?? 0}</strong><span>instructions</span></div>
      </div>
      {metadata && (
        <div className={`status ${metadata.status.startsWith("partial") ? "warning" : ""}`}>
          <strong>{scanStatusText(metadata.status)}</strong>
          <p>{metadata.charactersScanned} characters scanned across {metadata.chunksCompleted}/{metadata.chunksQueued} chunks. Worker restarts: {metadata.workerRestartCount}.</p>
          {(metadata.framesDetected ?? 1) > 1 && (
            <p>Frames scanned: {metadata.framesScanned ?? 1} of {metadata.framesDetected}.</p>
          )}
          {(metadata.shadowRootsVisited ?? 0) > 0 && <p>Shadow roots inspected: {metadata.shadowRootsVisited}.</p>}
          {metadata.partialReasons.map((reason) => (
            <p key={`${reason.code}:${reason.source ?? reason.phase}`}><b>{reason.code}:</b> {reason.explanation}</p>
          ))}
        </div>
      )}
      <p className="disclaimer">Detection is advisory and local. It can miss attacks and can flag benign content, so review evidence before relying on any result.</p>
    </section>
  );
}

/** Groups findings by rule, preserving scan order and the index of each occurrence. */
function groupFindingsByRule(findings: Finding[]): Array<{ ruleId: string; title: string; indexes: number[]; findings: Finding[] }> {
  const groups = new Map<string, { ruleId: string; title: string; indexes: number[]; findings: Finding[] }>();
  findings.forEach((finding, index) => {
    const group = groups.get(finding.ruleId) ?? {
      ruleId: finding.ruleId,
      title: finding.title ?? finding.ruleId,
      indexes: [],
      findings: []
    };
    group.indexes.push(index);
    group.findings.push(finding);
    groups.set(finding.ruleId, group);
  });
  return [...groups.values()];
}

function Findings(props: {
  findings: Finding[];
  selected?: Finding;
  activeFinding: number;
  next(delta: number): void;
  select(index: number): void;
  highlight(finding?: Finding): void;
  reveal(finding?: Finding): void;
  clear(): void;
  onIgnoreRule(finding: Finding): void;
}) {
  const groups = groupFindingsByRule(props.findings);
  return (
    <section>
      {groups.length > 1 && (
        // A page can repeat one rule dozens of times. Paging through every card to
        // learn there are only three distinct problems is the slow way to triage.
        <div className="rule-chips">
          {groups.map((group) => (
            <button
              key={group.ruleId}
              className={props.selected?.ruleId === group.ruleId ? "active" : ""}
              onClick={() => props.select(group.indexes[0] ?? 0)}
              title={`Jump to the first ${group.ruleId} finding`}
            >
              {group.ruleId} <b>{group.findings.length}</b>
            </button>
          ))}
        </div>
      )}
      <div className="toolbar">
        <button onClick={() => props.next(-1)} title="Previous finding"><ChevronLeft size={16} /></button>
        <span>{props.findings.length ? props.activeFinding + 1 : 0} / {props.findings.length}</span>
        <button onClick={() => props.next(1)} title="Next finding"><ChevronRight size={16} /></button>
        <button onClick={() => props.highlight(props.selected)} title="Highlight selected finding"><Eye size={16} /></button>
        <button onClick={() => props.reveal(props.selected)} title="Reveal hidden text"><AlertTriangle size={16} /></button>
        <button onClick={props.clear} title="Remove highlights"><Trash2 size={16} /></button>
      </div>
      {props.selected ? <FindingCard finding={props.selected} onIgnoreRule={props.onIgnoreRule} /> : <Empty text="No findings yet." />}
    </section>
  );
}

function FindingList({
  title,
  findings,
  onHighlight,
  onReveal,
  onIgnoreRule
}: {
  title: string;
  findings: Finding[];
  onHighlight(f: Finding): void;
  onReveal(f: Finding): void;
  onIgnoreRule?(f: Finding): void;
}) {
  const groups = groupFindingsByRule(findings);
  return (
    <section>
      <h2>{title}</h2>
      {findings.length === 0 && <Empty text="No matching findings." />}
      {groups.map((group) => (
        <div className="finding-group" key={group.ruleId}>
          {group.findings.length > 1 && (
            <p className="group-head">
              <b>{group.ruleId}</b> - {group.findings.length} occurrences
            </p>
          )}
          {group.findings.map((finding) => (
            <div className="finding" key={finding.id}>
              <FindingCard finding={finding} onIgnoreRule={onIgnoreRule} />
              <div className="toolbar">
                <button onClick={() => onHighlight(finding)} title="Highlight"><Eye size={16} /></button>
                <button onClick={() => onReveal(finding)} title="Reveal"><AlertTriangle size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function FindingCard({ finding, onIgnoreRule }: { finding: Finding; onIgnoreRule?(finding: Finding): void }) {
  return (
    <article className={`finding ${finding.severity}`}>
      <div className="finding-head">
        <strong>{finding.title ?? finding.ruleId}</strong>
        <span>{finding.verdict ? verdictText(finding.verdict) : finding.severity} - {Math.round(finding.confidence * 100)}%</span>
      </div>
      <p><b>Rule:</b> {finding.ruleId}</p>
      <p><b>Selector:</b> {finding.selector}</p>
      {finding.frameUrl && <p><b>Frame:</b> {finding.frameUrl}</p>}
      <p><b>Evidence:</b> {finding.evidence}</p>
      {finding.decodedEvidence && <p><b>Decoded:</b> {finding.decodedEvidence}</p>}
      <p><b>Security Concern:</b> {finding.concern ?? finding.explanation}</p>
      {finding.possibleImpact && <p><b>What Could Happen:</b> {finding.possibleImpact}</p>}
      <p><b>Why AgentSafe Flagged It:</b> {finding.whyItMatters ?? finding.explanation}</p>
      {finding.confidenceReason && <p><b>Confidence:</b> {finding.confidenceReason}</p>}
      {finding.falsePositiveGuidance && <p><b>May Be Benign If:</b> {finding.falsePositiveGuidance}</p>}
      <p><b>Recommended Action:</b> {finding.recommendedAction}</p>
      <p><b>Visible:</b> {finding.visibleToUser ? "yes" : "no"} - <b>Likely extracted:</b> {finding.likelyInExtractedText ? "yes" : "no"}</p>
      {finding.cssProperties && <pre>{JSON.stringify(finding.cssProperties, null, 2)}</pre>}
      {onIgnoreRule && (
        <button
          className="ignore-rule"
          onClick={() => onIgnoreRule(finding)}
          title={`Stop reporting ${finding.ruleId} on this site. Other rules keep running.`}
        >
          <BellOff size={14} /> Ignore this rule on this site
        </button>
      )}
    </article>
  );
}

function verdictText(verdict: NonNullable<Finding["verdict"]>) {
  return {
    "confirmed-risk": "confirmed risk",
    "likely-risk": "likely risk",
    "needs-review": "needs review",
    "low-confidence-signal": "low-confidence signal"
  }[verdict];
}

function Sanitized({ report }: { report: SanitizedExport | null }) {
  if (!report) return <Empty text="Scan first to generate sanitized content." />;
  return (
    <section>
      <h2>Sanitized Markdown</h2>
      <textarea value={report.sanitizedMarkdown} readOnly />
      <h2>Before/After Diff</h2>
      <pre>{report.diff}</pre>
    </section>
  );
}

function Export({ report, scan }: { report: SanitizedExport | null; scan: ScanResult | null }) {
  if (!report || !scan) return <Empty text="Scan first to enable export." />;
  return (
    <section>
      <dl>
        <dt>Source URL</dt><dd>{report.sourceUrl}</dd>
        <dt>Title</dt><dd>{report.pageTitle}</dd>
        <dt>Timestamp</dt><dd>{report.extractedAt}</dd>
        <dt>Content hash</dt><dd>{report.contentHash}</dd>
      </dl>
      <div className="toolbar">
        <button onClick={() => navigator.clipboard.writeText(report.sanitizedMarkdown)} title="Copy sanitized Markdown"><Clipboard size={16} /> Copy Markdown</button>
        <button onClick={() => download("agentsafe-sanitized.md", report.sanitizedMarkdown, "text/markdown")} title="Download Markdown"><Download size={16} /> Markdown</button>
        <button onClick={() => download("agentsafe-report.json", JSON.stringify(report, null, 2), "application/json")} title="Download JSON report"><Download size={16} /> JSON</button>
      </div>
      <h2>Removed or Transformed</h2>
      <FindingList title="" findings={report.removedOrTransformedFindings} onHighlight={() => undefined} onReveal={() => undefined} />
    </section>
  );
}

function WebMcpSecurity({ report, enabled }: { report: WebMcpSecurityReport | null; enabled: boolean }) {
  if (!enabled) return <Empty text="Experimental WebMCP Security is disabled in Settings." />;
  if (!report) return <Empty text="Scan first to inspect WebMCP tool metadata. AgentSafe will not execute tools." />;
  return (
    <section>
      <div className="score webmcp-score">
        <ShieldCheck size={22} />
        <span>{report.tools.length}</span>
        <small>Experimental WebMCP tools discovered</small>
      </div>
      <dl>
        <dt>Browser support</dt><dd>{report.browserSupport.status} - {report.browserSupport.message}</dd>
        <dt>Page origin</dt><dd>{report.pageOrigin}</dd>
        <dt>Scanner engine</dt><dd>{report.scannerEngineVersion}</dd>
      </dl>
      {report.tools.length === 0 && (
        <Empty text="No WebMCP tools are registered on this page. AgentSafe still scanned the webpage for ordinary hidden and indirect prompt-injection risks." />
      )}
      {report.tools.map((result, index) => (
        <article className={`finding ${riskSeverity(result.riskScore)}`} key={`${result.tool.type}:${result.tool.name ?? index}`}>
          <div className="finding-head">
            <strong>{result.tool.name ?? "Unnamed tool"}</strong>
            <span>{result.decision}</span>
          </div>
          <p><b>Type:</b> {result.tool.type} - <b>Action:</b> {result.classification.classification}{result.classification.inferred ? " (inferred)" : ""}</p>
          <p><b>Risk:</b> {result.riskScore} - <b>Confidence:</b> {Math.round(result.confidence * 100)}% - <b>Findings:</b> {result.findings.length}</p>
          <p><b>Origin:</b> {result.origin ?? report.pageOrigin}</p>
          {result.tool.description && <p><b>Description:</b> {result.tool.description}</p>}
          {result.tool.annotations && <pre>{JSON.stringify(result.tool.annotations, null, 2)}</pre>}
          <details>
            <summary>Tool details</summary>
            <p><b>Parameters:</b> {result.tool.parameterNames.join(", ") || "none"}</p>
            <p><b>Parameter descriptions:</b> {result.tool.parameterDescriptions.join(" - ") || "none"}</p>
            <p><b>Enum values:</b> {result.tool.enumValues.join(", ") || "none"}</p>
            <h2>Input Schema</h2>
            <pre>{JSON.stringify(result.tool.inputSchema ?? {}, null, 2)}</pre>
            <h2>Output Schema</h2>
            <pre>{JSON.stringify(result.tool.outputSchema ?? {}, null, 2)}</pre>
            {result.findings.map((finding) => (
              <div className="finding mini" key={`${finding.ruleId}:${finding.evidence}`}>
                <p><b>{finding.ruleId}</b> - {finding.severity} - {Math.round(finding.confidence * 100)}%</p>
                <p><b>Evidence:</b> {finding.evidence}</p>
                <p><b>Why:</b> {finding.explanation}</p>
                <p><b>Action:</b> {finding.recommendedAction}</p>
              </div>
            ))}
          </details>
        </article>
      ))}
      <div className="toolbar">
        <button onClick={() => navigator.clipboard.writeText(exportWebMcpReportJson(report))} title="Copy WebMCP report JSON"><Clipboard size={16} /> Copy JSON</button>
        <button onClick={() => navigator.clipboard.writeText(exportWebMcpReportMarkdown(report))} title="Copy WebMCP report Markdown"><Clipboard size={16} /> Copy Markdown</button>
        <button onClick={() => download("agentsafe-webmcp-report.json", exportWebMcpReportJson(report), "application/json")} title="Download WebMCP JSON"><Download size={16} /> JSON</button>
        <button onClick={() => download("agentsafe-webmcp-report.md", exportWebMcpReportMarkdown(report), "text/markdown")} title="Download WebMCP Markdown"><Download size={16} /> Markdown</button>
      </div>
    </section>
  );
}

function Settings({ settings, setSettings }: { settings: ScannerSettings; setSettings(settings: ScannerSettings): void }) {
  const categories = defaultSettings.enabledCategories;
  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
  const exceptionsJson = useMemo(() => JSON.stringify(settings.scopedExceptions, null, 2), [settings.scopedExceptions]);
  const categoryHelp: Record<string, string> = {
    "hidden-css": "Detects text hidden with CSS such as display:none, opacity, clipping, tiny font size, or off-screen positioning.",
    "unicode-security": "Detects zero-width and bidirectional Unicode controls that can hide or reorder text.",
    "instruction-pattern": "Detects advisory prompt-injection phrases such as ignore previous instructions or reveal system prompt.",
    "encoded-content": "Detects base64-like text that decodes into readable instruction-like content.",
    metadata: "Detects suspicious instruction-like content in meta tags.",
    "html-comment": "Detects suspicious instruction-like content in HTML comments.",
    accessibility: "Detects aria-hidden content that contains instruction-like text.",
    exfiltration: "Detects tool-use or data-exfiltration style instructions.",
    delimiter: "Detects prompt-like delimiter blocks such as system/developer fences."
  };
  return (
    <section>
      <h2>Settings</h2>
      <label className="check-row" title="When enabled, AgentSafe scans a page after it loads if this site has already been approved for extension access.">
        <input type="checkbox" checked={settings.autoScanEnabled} onChange={(event) => setSettings({ ...settings, autoScanEnabled: event.target.checked })} />
        <span>Auto-scan approved sites on page load</span>
      </label>
      <label className="check-row" title="Shows the current tab's finding count on the extension icon after a scan.">
        <input type="checkbox" checked={settings.badgeEnabled} onChange={(event) => setSettings({ ...settings, badgeEnabled: event.target.checked })} />
        <span>Show badge issue count</span>
      </label>
      <label className="check-row" title="Experimental. Passively inspects WebMCP tool metadata when the browser exposes it or declarative tool forms are present. AgentSafe never executes WebMCP tools.">
        <input type="checkbox" checked={settings.experimentalWebMcpSecurity} onChange={(event) => setSettings({ ...settings, experimentalWebMcpSecurity: event.target.checked })} />
        <span>Experimental WebMCP Security Scanner</span>
      </label>
      <label title="Wait this long after page load before running an auto-scan. Longer delays can help dynamic pages finish rendering."> Auto-scan delay
        <select value={settings.autoScanDelayMs} onChange={(event) => setSettings({ ...settings, autoScanDelayMs: Number(event.target.value) })}>
          <option value={500}>0.5 seconds</option>
          <option value={1200}>1.2 seconds</option>
          <option value={3000}>3 seconds</option>
          <option value={5000}>5 seconds</option>
        </select>
      </label>
      <label title="Controls scoring thresholds. High sensitivity surfaces more advisory findings; low sensitivity reduces noise."> Sensitivity
        <select value={settings.sensitivity} onChange={(event) => setSettings({ ...settings, sensitivity: event.target.value as ScannerSettings["sensitivity"] })}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label title="Controls Worker chunk size and resource budgets. Deep scan is intended for explicit manual review of large pages."> Scan mode
        <select value={settings.scanMode} onChange={(event) => setSettings({ ...settings, scanMode: event.target.value as ScannerSettings["scanMode"] })}>
          <option value="quick">Quick</option>
          <option value="standard">Standard</option>
          <option value="deep">Deep</option>
        </select>
      </label>
      <label className="check-row" title="When enabled, aria-hidden text is inspected for instruction-like content because extraction pipelines may still include it.">
        <input type="checkbox" checked={settings.includeAriaHidden} onChange={(event) => setSettings({ ...settings, includeAriaHidden: event.target.checked })} />
        <span>Include aria-hidden content</span>
      </label>
      <div className="checks">
        {categories.map((category) => (
          <label className="check-row category-check" key={category} title={categoryHelp[category]}>
            <input
              type="checkbox"
              checked={settings.enabledCategories.includes(category)}
              onChange={(event) => {
                const enabledCategories = event.target.checked
                  ? [...settings.enabledCategories, category]
                  : settings.enabledCategories.filter((value) => value !== category);
                setSettings({ ...settings, enabledCategories });
              }}
            />
            <span>{category}</span>
          </label>
        ))}
      </div>
      <label title="Domains listed here are skipped by the scanner. Add one domain per line, such as example.com.">Domain allowlist<textarea value={settings.domainAllowlist.join("\n")} onChange={(event) => setSettings({ ...settings, domainAllowlist: event.target.value.split(/\r?\n/).filter(Boolean) })} /></label>
      <label title="Phrases listed here are ignored when matching findings. Add one phrase per line.">Phrase allowlist<textarea value={settings.phraseAllowlist.join("\n")} onChange={(event) => setSettings({ ...settings, phraseAllowlist: event.target.value.split(/\r?\n/).filter(Boolean) })} /></label>
      {settings.scopedExceptions.length > 0 && (
        <div className="exception-list">
          <h2>Ignored rules</h2>
          {settings.scopedExceptions.map((exception) => (
            <div className="exception-row" key={exception.id}>
              <span>
                <b>{exception.ruleIds.join(", ") || "all rules"}</b> on {exception.scopeValue}
                <small> ({exception.scopeType})</small>
              </span>
              <button
                onClick={() =>
                  setSettings({
                    ...settings,
                    scopedExceptions: settings.scopedExceptions.filter((candidate) => candidate.id !== exception.id)
                  })
                }
                title="Stop ignoring this rule. Rescan to see its findings again."
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <label title="Scoped exceptions are local JSON rules. Prefer rule-specific exceptions over broad domain skips.">Scoped exceptions<textarea value={exceptionsJson} onChange={(event) => {
        try {
          const parsed = JSON.parse(event.target.value);
          if (Array.isArray(parsed)) setSettings({ ...settings, scopedExceptions: parsed });
        } catch {
          // Keep typing until valid JSON is available.
        }
      }} /></label>
      <div className="toolbar">
        <button onClick={() => setSettings(defaultSettings)} title="Reset settings"><RotateCcw size={16} /> Reset</button>
        <button onClick={() => navigator.clipboard.writeText(settingsJson)} title="Copy settings JSON"><Clipboard size={16} /> Export</button>
      </div>
      <textarea aria-label="Settings JSON" value={settingsJson} onChange={(event) => {
        try {
          setSettings({ ...defaultSettings, ...JSON.parse(event.target.value) });
        } catch {
          // Keep typing until valid JSON is available.
        }
      }} />
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}

/**
 * Saves through an anchor rather than chrome.downloads. The API added a permission
 * to the install prompt for something an extension page can already do, and every
 * permission the manifest drops is one less thing a user has to accept.
 */
function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking immediately can cancel a download that has not started reading yet.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

createRoot(document.getElementById("root")!).render(<App />);

async function executeWithPageAccess<Args extends unknown[], Result>(
  tabInfo: chrome.tabs.Tab,
  func: (...args: Args) => Result,
  args?: Args,
  options: { requestPermission?: boolean; allFrames?: boolean } = { requestPermission: true }
): Promise<chrome.scripting.InjectionResult[]> {
  if (!tabInfo.id) throw new Error("No active tab available.");
  const target: chrome.scripting.InjectionTarget = { tabId: tabInfo.id, allFrames: options.allFrames ?? false };
  try {
    return await chrome.scripting.executeScript({ target, func, args });
  } catch (error) {
    if (!isHostPermissionError(error)) throw error;
    if (!options.requestPermission) throw new Error(accessHelpForUrl(tabInfo.url));
    await ensurePageHostAccess(tabInfo.url, true);
    return chrome.scripting.executeScript({ target, func, args });
  }
}

/**
 * Combines the per-frame extractions into one result.
 *
 * Chrome injects into every frame it has access to and silently omits the rest,
 * so cross-origin frames the user has not granted are simply missing. Comparing
 * the frames that answered against the frame elements they reported lets the scan
 * say how much of the page it actually covered. Segment ids are re-prefixed per
 * frame because each frame numbers its own from zero, and finding corroboration
 * groups by that id.
 */
function mergeFrameExtractions(results: chrome.scripting.InjectionResult[], maxCharacters: number): PageExtractionResult {
  const frames = results
    .map((entry) => ({ frameId: entry.frameId ?? 0, result: entry.result as PageExtractionResult | undefined }))
    .filter((entry): entry is { frameId: number; result: PageExtractionResult } => Boolean(entry.result?.segments));
  const main = frames.find((entry) => entry.frameId === 0) ?? frames[0];
  if (!main) throw new Error("Could not extract text from the active page.");
  const merged: PageExtractionResult = {
    scanId: main.result.scanId,
    pageUrl: main.result.pageUrl,
    pageTitle: main.result.pageTitle,
    segments: [],
    metrics: {
      nodesVisited: 0,
      textNodesVisited: 0,
      candidateHiddenElements: 0,
      computedStyleInspections: 0,
      charactersExtracted: 0,
      traversalDurationMs: 0,
      shadowRootsVisited: 0,
      partialReasons: []
    }
  };

  let frameElements = 0;
  let truncated = false;
  for (const frame of frames) {
    const metrics = frame.result.metrics;
    merged.metrics.nodesVisited += metrics.nodesVisited;
    merged.metrics.textNodesVisited += metrics.textNodesVisited;
    merged.metrics.candidateHiddenElements += metrics.candidateHiddenElements;
    merged.metrics.computedStyleInspections += metrics.computedStyleInspections;
    merged.metrics.traversalDurationMs = Math.max(merged.metrics.traversalDurationMs, metrics.traversalDurationMs);
    merged.metrics.shadowRootsVisited = (merged.metrics.shadowRootsVisited ?? 0) + (metrics.shadowRootsVisited ?? 0);
    merged.metrics.partialReasons.push(...metrics.partialReasons);
    frameElements += metrics.iframeCount ?? 0;

    for (const segment of frame.result.segments) {
      if (merged.metrics.charactersExtracted + segment.text.length > maxCharacters) {
        truncated = true;
        break;
      }
      merged.segments.push({ ...segment, sourceId: `f${frame.frameId}:${segment.sourceId}` });
      merged.metrics.charactersExtracted += segment.text.length;
    }
  }

  merged.metrics.framesScanned = frames.length;
  merged.metrics.framesDetected = Math.max(frames.length, frameElements + 1);
  if (truncated) {
    merged.metrics.partialReasons.push({
      code: "partial_size_limit",
      explanation: "Combined frame content reached the configured character limit; later frames were not scanned.",
      phase: "extracting_text",
      workCompleted: merged.metrics.charactersExtracted
    });
  }
  if (merged.metrics.framesScanned < merged.metrics.framesDetected) {
    merged.metrics.partialReasons.push({
      code: "partial_node_limit",
      explanation: `Scanned ${merged.metrics.framesScanned} of ${merged.metrics.framesDetected} frames. Chrome withholds frames whose origin has not been granted, so embedded content from other sites was not inspected.`,
      phase: "extracting_text"
    });
  }
  return merged;
}

async function ensurePageHostAccess(url: string | undefined, requestPermission: boolean): Promise<void> {
  const origin = originPattern(url);
  if (!origin) {
    if (url?.startsWith("file:")) return;
    throw new Error(accessHelpForUrl(url));
  }
  const alreadyGranted = await chrome.permissions.contains({ origins: [origin] });
  if (alreadyGranted) return;
  if (!requestPermission) throw new Error(accessHelpForUrl(url));
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error(accessHelpForUrl(url));
}

async function saveCachedResult(tabId: number, scan: ScanResult, report: SanitizedExport, source: "manual" | "auto", webMcpReport?: WebMcpSecurityReport) {
  await chrome.storage.session.set({
    [cacheKey(tabId)]: {
      scan,
      report,
      webMcpReport,
      source,
      scannedAt: new Date().toISOString()
    } satisfies CachedScan
  });
}

async function updateBadge(tabId: number, scan: ScanResult, enabled: boolean) {
  if (!enabled) {
    await chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  const count = scan.findings.length;
  await chrome.action.setBadgeText({ tabId, text: count === 0 ? "" : count > 9 ? "9+" : String(count) });
  const hasHigh = scan.findings.some((finding) => finding.severity === "high" || finding.severity === "critical");
  const hasMedium = scan.findings.some((finding) => finding.severity === "medium");
  await chrome.action.setBadgeBackgroundColor({ tabId, color: hasHigh ? "#d92d20" : hasMedium ? "#d97706" : "#2563eb" });
}

function cacheKey(tabId: number) {
  return `agentsafe.scan.${tabId}`;
}

function isHostPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Cannot access contents of the page") || message.includes("Extension manifest must request permission");
}

function originPattern(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return null;
  }
}

function accessHelpForUrl(url: string | undefined): string {
  if (!url) return "Chrome did not grant access to the active page.";
  if (url.startsWith("file:")) {
    return "Chrome blocks local files until you enable AgentSafe's 'Allow access to file URLs' toggle at chrome://extensions.";
  }
  if (/^(chrome|edge|about|chrome-extension):/.test(url)) {
    return "Chrome does not allow extensions to scan browser-internal pages.";
  }
  return "Chrome did not grant access. Click the extension icon on this tab or approve the site-access prompt, then scan again.";
}

function formatScanError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function riskSeverity(score: number): Severity {
  if (score >= 85) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "informational";
}

function scanStatusText(status: string) {
  if (status === "complete_within_configured_limits") return "Scan completed within configured limits";
  if (status.startsWith("partial")) return "Partial scan: some content was not analyzed";
  if (status === "cancelled") return "Scan cancelled";
  if (status === "failed") return "Scan failed";
  return "Scan completed";
}

function hostnameForAgentSafe(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isDomainAllowedForAgentSafe(url: string, allowlist: string[]): boolean {
  if (!url || allowlist.length === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowlist.some((entry) => {
      const normalized = entry.trim().toLowerCase();
      return normalized && (host === normalized || host.endsWith(`.${normalized}`));
    });
  } catch {
    return false;
  }
}

function cancelTextExtractionForAgentSafe(scanId: string) {
  (globalThis as { __agentsafeCancelledScanId?: string }).__agentsafeCancelledScanId = scanId;
}

async function collectTextSegmentsForAgentSafe(scanId: string, mode: "quick" | "standard" | "deep", phraseAllowlist: string[], includeAriaHidden: boolean) {
  type Segment = {
    sourceId: string;
    nodeId: string;
    selector: string;
    frameUrl: string;
    visibility: "visible" | "hidden" | "metadata" | "comment";
    tagName: string;
    text: string;
    textOffset: number;
    sourceCharCount: number;
    hiddenReasons: Record<string, string>;
    visibleToUser: boolean;
    likelyInExtractedText: boolean;
  };
  const limits = {
    quick: { nodes: 12_000, textNodes: 4_000, chars: 2 * 1024 * 1024, textNodeChars: 256 * 1024 },
    standard: { nodes: 35_000, textNodes: 12_000, chars: 5 * 1024 * 1024, textNodeChars: 512 * 1024 },
    deep: { nodes: 100_000, textNodes: 50_000, chars: 20 * 1024 * 1024, textNodeChars: 1024 * 1024 }
  }[mode];
  const started = performance.now();
  const segments: Segment[] = [];
  const partialReasons: Array<{ code: string; explanation: string; phase: string; source?: string; workCompleted?: number; workSkipped?: number }> = [];
  let nodesVisited = 0;
  let textNodesVisited = 0;
  let candidateHiddenElements = 0;
  let computedStyleInspections = 0;
  let charactersExtracted = 0;
  let nodeCounter = 0;
  let shadowRootsVisited = 0;
  let urlSegments = 0;
  const urlAttributeForAgentSafe = (element: Element): string | null => {
    const tag = element.tagName.toLowerCase();
    if (tag === "a" || tag === "area") return element.getAttribute("href");
    if (tag === "img" || tag === "source" || tag === "iframe" || tag === "embed") return element.getAttribute("src");
    if (tag === "form") return element.getAttribute("action");
    return null;
  };
  const cancelled = () => (globalThis as { __agentsafeCancelledScanId?: string }).__agentsafeCancelledScanId === scanId;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
  const selectorForAgentSafe = (element: Element): string => {
    const cssEscape = globalThis.CSS?.escape ?? ((value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"));
    if (element.id) return `#${cssEscape(element.id)}`;
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      const index = Array.from(parent.children).filter((child) => child.tagName === current!.tagName).indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      current = parent;
    }
    return parts.join(" > ");
  };
  const cheapHiddenReasonsForAgentSafe = (element: Element): Record<string, string> => {
    const reasons: Record<string, string> = {};
    if ((element as HTMLElement).hidden) reasons.hidden = "hidden attribute";
    if (element.getAttribute("aria-hidden") === "true") reasons.ariaHidden = "aria-hidden=true";
    const style = element.getAttribute("style") ?? "";
    if (/display\s*:\s*none/i.test(style)) reasons.display = "inline display:none";
    if (/visibility\s*:\s*hidden/i.test(style)) reasons.visibility = "inline visibility:hidden";
    if (/opacity\s*:\s*(0|0\.0+)/i.test(style)) reasons.opacity = "inline opacity near zero";
    if (/left\s*:\s*-\d{3,}/i.test(style) || /top\s*:\s*-\d{3,}/i.test(style)) reasons.position = "inline off-screen position";
    if (element.closest("template,noscript")) reasons.container = "template/noscript container";
    return reasons;
  };
  const computedHiddenReasonsForAgentSafe = (element: Element): Record<string, string> => {
    const reasons: Record<string, string> = {};
    const style = getComputedStyle(element);
    if (style.display === "none") reasons.display = style.display;
    if (style.visibility === "hidden" || style.visibility === "collapse") reasons.visibility = style.visibility;
    if (Number.parseFloat(style.opacity || "1") <= 0.03) reasons.opacity = style.opacity;
    if (Number.parseFloat(style.fontSize || "16") <= 1) reasons.fontSize = style.fontSize;
    const rect = element.getBoundingClientRect();
    if ((rect.width === 0 || rect.height === 0) && (element.textContent?.trim().length ?? 0) > 0) reasons.box = `${rect.width}x${rect.height}`;
    const left = Number.parseFloat(style.left || "0");
    const top = Number.parseFloat(style.top || "0");
    if ((style.position === "absolute" || style.position === "fixed") && (left < -999 || top < -999 || left > 20000 || top > 20000)) reasons.position = `${style.position}; left:${style.left}; top:${style.top}`;
    const clip = [style.clip, style.clipPath].filter(Boolean).join(" ");
    if (/rect\(\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*\)|inset\(50%\)/i.test(clip)) reasons.clip = clip;
    return reasons;
  };
  const allowedPhrases = phraseAllowlist.map((phrase) => phrase.trim().toLowerCase()).filter(Boolean);
  const isAllowedPhrase = (text: string) => {
    const normalized = text.toLowerCase();
    return allowedPhrases.some((phrase) => normalized.includes(phrase));
  };
  const pushSegment = (segment: Segment) => {
    if (!segment.text.trim()) return;
    if (isAllowedPhrase(segment.text)) return;
    if (segment.hiddenReasons.ariaHidden && !includeAriaHidden) return;
    if (charactersExtracted >= limits.chars) return;
    const remaining = limits.chars - charactersExtracted;
    const text = segment.text.slice(0, Math.min(segment.text.length, remaining, limits.textNodeChars));
    if (text.length < segment.text.length) {
      partialReasons.push({
        code: text.length >= remaining ? "partial_size_limit" : "partial_node_limit",
        explanation: text.length >= remaining ? `Configured ${mode} character limit reached.` : "Individual text-node limit reached.",
        phase: "extracting_text",
        source: segment.selector,
        workCompleted: charactersExtracted,
        workSkipped: segment.text.length - text.length
      });
    }
    segments.push({ ...segment, text, sourceCharCount: segment.text.length });
    charactersExtracted += text.length;
  };

  const meta = Array.from(document.querySelectorAll<HTMLMetaElement>("meta[content]"));
  for (const element of meta) {
    pushSegment({
      sourceId: `meta:${nodeCounter++}`,
      nodeId: `meta:${nodeCounter}`,
      selector: selectorForAgentSafe(element),
      frameUrl: location.href,
      visibility: "metadata",
      tagName: "meta",
      text: element.content,
      textOffset: 0,
      sourceCharCount: element.content.length,
      hiddenReasons: { metadata: "meta[content]" },
      visibleToUser: false,
      likelyInExtractedText: true
    });
  }

  // Open shadow roots are walked as additional roots. Their content is invisible
  // to a document-level TreeWalker but is still read by extraction tooling, so it
  // is exactly the kind of surface AgentSafe exists to inspect. Closed roots stay
  // unreachable by design. Selectors inside a shadow root are recorded relative to
  // that root and joined to the host with " >>> ", because document.querySelector
  // cannot cross the boundary.
  const roots: Array<{ root: Node; hostPath: string }> = [{ root: document.body ?? document.documentElement, hostPath: "" }];
  const joinShadowPath = (hostPath: string, selector: string) => (hostPath ? `${hostPath} >>> ${selector}` : selector);
  let stopped = false;

  while (roots.length > 0 && !stopped) {
    const current = roots.shift()!;
    const walker = document.createTreeWalker(current.root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_ELEMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (cancelled()) {
        partialReasons.push({ code: "cancelled", explanation: "DOM traversal cancelled by user.", phase: "traversing_dom", workCompleted: nodesVisited });
        stopped = true;
        break;
      }
      nodesVisited += 1;
      if (nodesVisited > limits.nodes) {
        partialReasons.push({ code: "partial_node_limit", explanation: "DOM node limit reached.", phase: "traversing_dom", workCompleted: nodesVisited });
        stopped = true;
        break;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const host = node as Element;
        if (host.shadowRoot) {
          shadowRootsVisited += 1;
          roots.push({ root: host.shadowRoot, hostPath: joinShadowPath(current.hostPath, selectorForAgentSafe(host)) });
        }
        // Link and image URLs never appear in text nodes, so a data-carrying URL
        // was previously invisible to every rule. Only URLs with a query string
        // are collected: those are the ones that can carry anything out.
        const rawUrl = urlAttributeForAgentSafe(host);
        if (rawUrl && urlSegments < 200) {
          let resolved = "";
          try {
            const parsed = new URL(rawUrl, location.href);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") resolved = parsed.href;
          } catch {
            resolved = "";
          }
          if (resolved && resolved.includes("?")) {
            urlSegments += 1;
            const cheap = cheapHiddenReasonsForAgentSafe(host);
            const hiddenReasons: Record<string, string> =
              Object.keys(cheap).length > 0 ? { ...cheap, ...computedHiddenReasonsForAgentSafe(host) } : { ...cheap };
            // The text heuristics look for elements with no box around some text,
            // which never matches a tracking pixel: it has a box, just a tiny one,
            // and no text at all. Size is the signal that a media element is not
            // there to be seen.
            const rect = host.getBoundingClientRect();
            if (rect.width <= 4 || rect.height <= 4) hiddenReasons.box = `${rect.width}x${rect.height}`;
            const visibility = Object.keys(hiddenReasons).length ? "hidden" : "visible";
            pushSegment({
              sourceId: `url:${nodeCounter++}`,
              nodeId: `url:${nodeCounter}`,
              selector: joinShadowPath(current.hostPath, selectorForAgentSafe(host)),
              frameUrl: location.href,
              visibility,
              tagName: host.tagName.toLowerCase(),
              text: resolved,
              textOffset: 0,
              sourceCharCount: resolved.length,
              hiddenReasons,
              visibleToUser: visibility === "visible",
              likelyInExtractedText: true
            });
          }
        }
      } else if (node.nodeType === Node.COMMENT_NODE) {
        const text = (node as Comment).data.trim();
        if (text) pushSegment({
          sourceId: `comment:${nodeCounter++}`,
          nodeId: `comment:${nodeCounter}`,
          selector: "comment()",
          frameUrl: location.href,
          visibility: "comment",
          tagName: "#comment",
          text,
          textOffset: 0,
          sourceCharCount: text.length,
          hiddenReasons: { comment: "HTML comment" },
          visibleToUser: false,
          likelyInExtractedText: false
        });
      } else {
        textNodesVisited += 1;
        if (textNodesVisited > limits.textNodes) {
          partialReasons.push({ code: "partial_node_limit", explanation: "Text-node limit reached.", phase: "extracting_text", workCompleted: textNodesVisited });
          stopped = true;
          break;
        }
        const raw = node.textContent ?? "";
        const text = raw.replace(/\s+/g, " ").trim();
        const element = node.parentElement;
        if (!text || !element || element.closest("script,style")) continue;
        const cheap = cheapHiddenReasonsForAgentSafe(element);
        let hiddenReasons = cheap;
        if (Object.keys(cheap).length > 0 || element.getBoundingClientRect().width === 0 || element.getBoundingClientRect().height === 0) {
          candidateHiddenElements += 1;
          computedStyleInspections += 1;
          hiddenReasons = { ...cheap, ...computedHiddenReasonsForAgentSafe(element) };
        }
        const visibility = Object.keys(hiddenReasons).length ? "hidden" : "visible";
        pushSegment({
          sourceId: `text:${nodeCounter++}`,
          nodeId: `text:${nodeCounter}`,
          selector: joinShadowPath(current.hostPath, selectorForAgentSafe(element)),
          frameUrl: location.href,
          visibility,
          tagName: element.tagName.toLowerCase(),
          text,
          textOffset: 0,
          sourceCharCount: raw.length,
          hiddenReasons,
          visibleToUser: visibility === "visible",
          likelyInExtractedText: element.closest("noscript,template") === null
        });
      }
      if (nodesVisited % 250 === 0) await pause();
      if (charactersExtracted >= limits.chars) {
        partialReasons.push({ code: "partial_size_limit", explanation: `Configured ${mode} character limit reached.`, phase: "extracting_text", workCompleted: charactersExtracted });
        stopped = true;
        break;
      }
    }
  }

  return {
    scanId,
    pageUrl: location.href,
    pageTitle: document.title,
    segments,
    metrics: {
      nodesVisited,
      textNodesVisited,
      candidateHiddenElements,
      computedStyleInspections,
      charactersExtracted,
      shadowRootsVisited,
      iframeCount: document.querySelectorAll("iframe,frame").length,
      traversalDurationMs: Math.round(performance.now() - started),
      partialReasons
    }
  };
}

function snapshotPageForAgentSafe() {
  const clone = document.cloneNode(true) as Document;
  const originalElements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
  const clonedElements = Array.from(clone.querySelectorAll<HTMLElement>("body *"));
  originalElements.forEach((element, index) => {
    const target = clonedElements[index];
    if (!target) return;
    const style = getComputedStyle(element);
    const properties = ["display", "visibility", "opacity", "font-size", "position", "left", "top", "width", "height", "clip", "clip-path", "color", "background-color"];
    target.setAttribute("style", properties.map((property) => `${property}:${style.getPropertyValue(property)}`).join(";"));
  });
  return {
    html: clone.documentElement.outerHTML,
    url: location.href,
    title: document.title
  };
}

function collectWebMcpForAgentSafe() {
  type Tool = {
    name?: string;
    title?: string;
    description?: string;
    origin?: string;
    frameOrigin?: string;
    type: "declarative" | "imperative" | "unknown";
    inputSchema?: unknown;
    outputSchema?: unknown;
    parameterNames: string[];
    parameterDescriptions: string[];
    enumValues: string[];
    examples: string[];
    annotations?: Record<string, unknown>;
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  const hasNavigatorModelContext = "modelContext" in navigator;
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form[toolname][tooldescription]"));
  const tools: Tool[] = forms.map((form) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const field of Array.from(form.elements)) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
      const name = field.name || field.id;
      if (!name) continue;
      const description = field.getAttribute("toolparamdescription") ?? undefined;
      const schema: Record<string, unknown> = { type: field instanceof HTMLInputElement && field.type === "number" ? "number" : "string" };
      if (description) schema.description = description;
      if (field instanceof HTMLSelectElement) schema.enum = Array.from(field.options).map((option) => option.value || option.textContent || "").filter(Boolean);
      properties[name] = schema;
      if (field.required) required.push(name);
    }
    const annotations: Record<string, unknown> = {};
    for (const attribute of Array.from(form.attributes)) {
      if (attribute.name.startsWith("toolannotation-")) annotations[attribute.name.slice("toolannotation-".length)] = attribute.value;
    }
    return {
      name: form.getAttribute("toolname") ?? undefined,
      title: form.getAttribute("tooltitle") ?? undefined,
      description: form.getAttribute("tooldescription") ?? undefined,
      origin: location.origin,
      frameOrigin: location.origin,
      type: "declarative",
      inputSchema: { type: "object", properties, required },
      outputSchema: undefined,
      parameterNames: Object.keys(properties),
      parameterDescriptions: Object.values(properties).map((value) => typeof value === "object" && value && "description" in value ? String((value as { description?: unknown }).description ?? "") : "").filter(Boolean),
      enumValues: Object.values(properties).flatMap((value) => typeof value === "object" && value && "enum" in value && Array.isArray((value as { enum?: unknown }).enum) ? ((value as { enum: string[] }).enum) : []),
      examples: [],
      annotations: Object.keys(annotations).length ? annotations : undefined,
      readOnlyHint: form.hasAttribute("readonlyhint") || form.getAttribute("readonlyhint") === "true" || undefined,
      untrustedContentHint: form.hasAttribute("untrustedcontenthint") || form.getAttribute("untrustedcontenthint") === "true" || undefined
    };
  });
  const exposed = Array.isArray((globalThis as { __agentsafeWebMcpTools?: unknown[] }).__agentsafeWebMcpTools)
    ? ((globalThis as { __agentsafeWebMcpTools?: Partial<Tool>[] }).__agentsafeWebMcpTools ?? []).map((tool) => ({
        type: "imperative" as const,
        parameterNames: [],
        parameterDescriptions: [],
        enumValues: [],
        examples: [],
        origin: location.origin,
        frameOrigin: location.origin,
        ...tool
      }))
    : [];
  return {
    support: {
      status: hasNavigatorModelContext ? "supported" as const : forms.length ? "partial" as const : "unsupported" as const,
      hasNavigatorModelContext,
      hasDeclarativeCandidates: forms.length > 0,
      message: hasNavigatorModelContext
        ? "WebMCP browser API detected. AgentSafe scans registered metadata passively."
        : "WebMCP API was not detected. For local Chrome testing, enable chrome://flags/#enable-webmcp-testing and relaunch Chrome."
    },
    pageUrl: location.href,
    pageOrigin: location.origin,
    tools: [...tools, ...exposed]
  };
}

/**
 * Runs in the scanned page via chrome.scripting.executeScript, which serializes
 * this function and nothing else: any reference to a module-scope helper would
 * resolve against the page, where it does not exist, and fail silently. All three
 * page actions live here so the shared resolution logic is written once.
 *
 * Injected into every frame, so it first checks it is the frame the finding came
 * from. Selectors may cross shadow boundaries via " >>> ", which querySelector
 * cannot follow, and shadow roots do not inherit document styles, so the
 * highlight stylesheet is added to the containing root as well.
 */
function applyAgentSafePageAction(action: "highlight" | "reveal" | "clear", selector: string, frameUrl: string) {
  if (frameUrl && location.href !== frameUrl) return false;

  const STYLE_ID = "agentsafe-highlight-style";
  const CSS = `
    .agentsafe-highlight {
      outline: 3px solid #d92d20 !important;
      box-shadow: 0 0 0 6px rgba(217,45,32,.22) !important;
    }
    .agentsafe-reveal-hidden {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: static !important;
      width: auto !important;
      height: auto !important;
      clip: auto !important;
      clip-path: none !important;
      color: #111 !important;
      background: #fff3cd !important;
      font-size: 14px !important;
    }
  `;

  const injectStyles = (root: Document | ShadowRoot) => {
    const container = root instanceof Document ? root.documentElement : root;
    if ((root instanceof Document ? root.getElementById(STYLE_ID) : root.querySelector(`#${STYLE_ID}`))) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    container.append(style);
  };

  const clearWithin = (root: Document | ShadowRoot) => {
    for (const element of Array.from(root.querySelectorAll("*"))) {
      element.classList.remove("agentsafe-highlight", "agentsafe-reveal-hidden");
      const shadow = (element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (shadow) clearWithin(shadow);
    }
  };

  const resolve = (path: string): Element | null => {
    if (!path || path === "comment()") return null;
    let root: Document | ShadowRoot | null = document;
    let element: Element | null = null;
    for (const part of path.split(" >>> ")) {
      if (!root) return null;
      try {
        element = root.querySelector(part);
      } catch {
        return null;
      }
      if (!element) return null;
      root = (element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot ?? null;
    }
    return element;
  };

  if (action === "clear") {
    clearWithin(document);
    return true;
  }

  injectStyles(document);
  if (action === "highlight") clearWithin(document);

  const element = resolve(selector);
  if (!element) return false;

  const containingRoot = element.getRootNode();
  if (containingRoot instanceof ShadowRoot) injectStyles(containingRoot);

  if (action === "highlight") {
    element.classList.add("agentsafe-highlight");
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    element.classList.add("agentsafe-reveal-hidden");
  }
  return true;
}
