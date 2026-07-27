use agentsafe_core::{ScanLimits, Scanner, Sensitivity, SourceContext, TextScanRequest};
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_size(c: &mut Criterion, label: &str, size: usize) {
    let scanner = Scanner::try_default().unwrap();
    let text = "ordinary documentation text ".repeat(size / 28);
    c.bench_function(label, |b| {
        b.iter(|| {
            scanner
                .scan_text(TextScanRequest {
                    source_id: label.to_string(),
                    text: text.clone(),
                    sensitivity: Sensitivity::Medium,
                    context: SourceContext::default(),
                    limits: ScanLimits {
                        max_input_bytes: 2_000_000,
                        ..ScanLimits::default()
                    },
                })
                .unwrap()
        })
    });
}

fn benches(c: &mut Criterion) {
    bench_size(c, "64kb_text", 64 * 1024);
    bench_size(c, "128kb_text", 128 * 1024);
    bench_size(c, "256kb_text", 256 * 1024);
    bench_size(c, "1mb_text", 1024 * 1024);
}

criterion_group!(scanner_benches, benches);
criterion_main!(scanner_benches);
