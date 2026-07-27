import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, ChevronLeft, ChevronRight, Clipboard, Download, Eye, RotateCcw, ScanLine, Trash2 } from "lucide-react";
import { defaultSettings, type Finding, type SanitizedExport, type ScanResult, type ScannerSettings, type Severity } from "@agentsafe/shared-types";
import { scanDocument } from "@agentsafe/scanner";
import { createSanitizedExport } from "@agentsafe/markdown-exporter";
import "./style.css";

type Tab = "summary" | "findings" | "hidden" | "sanitized" | "export" | "settings";

interface PageSnapshot {
  html: string;
  url: string;
  title: string;
}

interface CachedScan {
  scan: ScanResult;
  report: SanitizedExport;
  scannedAt: string;
  source: "manual" | "auto";
}

const tabs: Array<[Tab, string]> = [
  ["summary", "Summary"],
  ["findings", "Findings"],
  ["hidden", "Hidden Content"],
  ["sanitized", "Sanitized Content"],
  ["export", "Export"],
  ["settings", "Settings"]
];

function App() {
  const [tab, setTab] = useState<Tab>("summary");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [report, setReport] = useState<SanitizedExport | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activeFinding, setActiveFinding] = useState(0);
  const [status, setStatus] = useState("Ready. Scanning only runs when you press Scan.");

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
  }, [settings.autoScanEnabled, settings.autoScanDelayMs, settings.badgeEnabled, settings.sensitivity, settings.enabledCategories, settings.includeAriaHidden, settings.phraseAllowlist, settings.domainAllowlist]);

  const findings = scan?.findings ?? [];
  const selected = findings[activeFinding];
  const hiddenFindings = findings.filter((finding) => !finding.visibleToUser);

  async function currentTab() {
    const [tabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabInfo?.id) throw new Error("No active tab available.");
    return tabInfo;
  }

  async function runScan(source: "manual" | "auto" = "manual") {
    setStatus(source === "auto" ? "Auto-scanning this page locally..." : "Scanning this page locally...");
    await chrome.storage.local.set({ "agentsafe.settings": settings });
    try {
      const tabInfo = await currentTab();
      const [{ result }] = await executeWithPageAccess(tabInfo, snapshotPageForAgentSafe, undefined, { requestPermission: source === "manual" });
      const pageSnapshot = result as PageSnapshot | undefined;
      if (!pageSnapshot) throw new Error("Could not read the active page.");
      const parsed = new DOMParser().parseFromString(pageSnapshot.html, "text/html");
      Object.defineProperty(parsed, "title", { value: pageSnapshot.title, configurable: true });
      const nextScan = scanDocument(parsed, settings);
      nextScan.context.url = pageSnapshot.url;
      nextScan.context.title = pageSnapshot.title;
      const nextReport = createSanitizedExport(parsed, nextScan.findings);
      nextReport.sourceUrl = pageSnapshot.url;
      nextReport.pageTitle = pageSnapshot.title;
      setScan(nextScan);
      setReport(nextReport);
      setActiveFinding(0);
      await saveCachedResult(tabInfo.id!, nextScan, nextReport, source);
      await updateBadge(tabInfo.id!, nextScan, settings.badgeEnabled);
      setStatus(`${source === "auto" ? "Auto-scan" : "Scan"} complete: ${nextScan.findings.length} findings.`);
    } catch (error) {
      if (source === "manual") setStatus(`Scan failed. ${formatScanError(error)}`);
    }
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
    const key = cacheKey(tabInfo.id);
    const stored = await chrome.storage.session.get([key]);
    const cached = stored[key] as CachedScan | undefined;
    if (!cached) return;
    setScan(cached.scan);
    setReport(cached.report);
    setActiveFinding(0);
    setStatus(`Loaded ${cached.source} scan from ${new Date(cached.scannedAt).toLocaleTimeString()}: ${cached.scan.findings.length} findings.`);
  }

  async function highlight(finding: Finding | undefined) {
    if (!finding) return;
    const tabInfo = await currentTab();
    await executeWithPageAccess(tabInfo, highlightAgentSafeFinding, [finding.selector]);
  }

  async function reveal(finding: Finding | undefined) {
    if (!finding) return;
    const tabInfo = await currentTab();
    await executeWithPageAccess(tabInfo, revealAgentSafeFinding, [finding.selector]);
  }

  async function clear() {
    const tabInfo = await currentTab();
    await executeWithPageAccess(tabInfo, clearAgentSafeHighlights);
  }

  function next(delta: number) {
    if (findings.length === 0) return;
    setActiveFinding((current) => (current + delta + findings.length) % findings.length);
  }

  return (
    <main>
      <header>
        <div>
          <h1>AgentSafe</h1>
          <p>Prompt Injection Detector</p>
        </div>
        <button className="primary" onClick={() => runScan("manual")} title="Scan current page">
          <ScanLine size={17} /> Scan
        </button>
      </header>

      <nav>
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      <p className="status">{status}</p>

      {tab === "summary" && <Summary scan={scan} />}
      {tab === "findings" && <Findings findings={findings} selected={selected} activeFinding={activeFinding} next={next} highlight={highlight} reveal={reveal} clear={clear} />}
      {tab === "hidden" && <FindingList title="Hidden Content" findings={hiddenFindings} onHighlight={highlight} onReveal={reveal} />}
      {tab === "sanitized" && <Sanitized report={report} />}
      {tab === "export" && <Export report={report} scan={scan} />}
      {tab === "settings" && <Settings settings={settings} setSettings={setSettings} />}
    </main>
  );
}

function Summary({ scan }: { scan: ScanResult | null }) {
  const severities: Severity[] = ["critical", "high", "medium", "low", "informational"];
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
      <p className="disclaimer">Detection is advisory and local. It can miss attacks and can flag benign content, so review evidence before relying on any result.</p>
    </section>
  );
}

function Findings(props: {
  findings: Finding[];
  selected?: Finding;
  activeFinding: number;
  next(delta: number): void;
  highlight(finding?: Finding): void;
  reveal(finding?: Finding): void;
  clear(): void;
}) {
  return (
    <section>
      <div className="toolbar">
        <button onClick={() => props.next(-1)} title="Previous finding"><ChevronLeft size={16} /></button>
        <span>{props.findings.length ? props.activeFinding + 1 : 0} / {props.findings.length}</span>
        <button onClick={() => props.next(1)} title="Next finding"><ChevronRight size={16} /></button>
        <button onClick={() => props.highlight(props.selected)} title="Highlight selected finding"><Eye size={16} /></button>
        <button onClick={() => props.reveal(props.selected)} title="Reveal hidden text"><AlertTriangle size={16} /></button>
        <button onClick={props.clear} title="Remove highlights"><Trash2 size={16} /></button>
      </div>
      {props.selected ? <FindingCard finding={props.selected} /> : <Empty text="No findings yet." />}
    </section>
  );
}

function FindingList({ title, findings, onHighlight, onReveal }: { title: string; findings: Finding[]; onHighlight(f: Finding): void; onReveal(f: Finding): void }) {
  return (
    <section>
      <h2>{title}</h2>
      {findings.length === 0 && <Empty text="No matching findings." />}
      {findings.map((finding) => (
        <div className="finding" key={finding.id}>
          <FindingCard finding={finding} />
          <div className="toolbar">
            <button onClick={() => onHighlight(finding)} title="Highlight"><Eye size={16} /></button>
            <button onClick={() => onReveal(finding)} title="Reveal"><AlertTriangle size={16} /></button>
          </div>
        </div>
      ))}
    </section>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className={`finding ${finding.severity}`}>
      <div className="finding-head">
        <strong>{finding.ruleId}</strong>
        <span>{finding.severity} · {Math.round(finding.confidence * 100)}%</span>
      </div>
      <p><b>Selector:</b> {finding.selector}</p>
      <p><b>Evidence:</b> {finding.evidence}</p>
      {finding.decodedEvidence && <p><b>Decoded:</b> {finding.decodedEvidence}</p>}
      <p><b>Why:</b> {finding.explanation}</p>
      <p><b>Action:</b> {finding.recommendedAction}</p>
      <p><b>Visible:</b> {finding.visibleToUser ? "yes" : "no"} · <b>Likely extracted:</b> {finding.likelyInExtractedText ? "yes" : "no"}</p>
      {finding.cssProperties && <pre>{JSON.stringify(finding.cssProperties, null, 2)}</pre>}
    </article>
  );
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

function Settings({ settings, setSettings }: { settings: ScannerSettings; setSettings(settings: ScannerSettings): void }) {
  const categories = defaultSettings.enabledCategories;
  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
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

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => URL.revokeObjectURL(url));
}

createRoot(document.getElementById("root")!).render(<App />);

async function executeWithPageAccess<Args extends unknown[], Result>(
  tabInfo: chrome.tabs.Tab,
  func: (...args: Args) => Result,
  args?: Args,
  options: { requestPermission?: boolean } = { requestPermission: true }
): Promise<chrome.scripting.InjectionResult[]> {
  if (!tabInfo.id) throw new Error("No active tab available.");
  await ensurePageHostAccess(tabInfo.url, options.requestPermission ?? true);
  try {
    return await chrome.scripting.executeScript({
      target: { tabId: tabInfo.id },
      func,
      args
    });
  } catch (error) {
    if (!isHostPermissionError(error)) throw error;
    if (!options.requestPermission) throw new Error(accessHelpForUrl(tabInfo.url));
    const granted = await requestPageHostAccess(tabInfo.url);
    if (!granted) throw new Error(accessHelpForUrl(tabInfo.url));
    return chrome.scripting.executeScript({
      target: { tabId: tabInfo.id },
      func,
      args
    });
  }
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

async function saveCachedResult(tabId: number, scan: ScanResult, report: SanitizedExport, source: "manual" | "auto") {
  await chrome.storage.session.set({
    [cacheKey(tabId)]: {
      scan,
      report,
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

async function requestPageHostAccess(url: string | undefined): Promise<boolean> {
  const origin = originPattern(url);
  if (!origin) return false;
  return chrome.permissions.request({ origins: [origin] });
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

function highlightAgentSafeFinding(selector: string) {
  injectAgentSafeStyles();
  clearAgentSafeHighlights();
  const element = queryAgentSafeElement(selector);
  element?.classList.add("agentsafe-highlight");
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function revealAgentSafeFinding(selector: string) {
  injectAgentSafeStyles();
  queryAgentSafeElement(selector)?.classList.add("agentsafe-reveal-hidden");
}

function clearAgentSafeHighlights() {
  document.querySelectorAll(".agentsafe-highlight,.agentsafe-reveal-hidden").forEach((element) => {
    element.classList.remove("agentsafe-highlight", "agentsafe-reveal-hidden");
  });
}

function queryAgentSafeElement(selector: string): Element | null {
  if (selector === "comment()") return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function injectAgentSafeStyles() {
  if (document.getElementById("agentsafe-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "agentsafe-highlight-style";
  style.textContent = `
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
  document.documentElement.append(style);
}
