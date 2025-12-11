#!/usr/bin/env python3
"""
Analyze Memory Leak Stress Test Results

Reads crash-safe JSONL log and generates:
1. Memory leak verification summary
2. Concurrency test summary
3. Markdown report with charts
"""

import json
import sys
from pathlib import Path
from typing import List
from dataclasses import dataclass


@dataclass
class TestResult:
    """Test result data"""
    test_id: str
    timestamp: str
    audio_file: str
    audio_size_mb: float
    concurrency: int
    task_id: str
    status: str
    processing_time: float
    rtf: float
    worker_rss_before_mb: float
    worker_rss_after_mb: float
    worker_rss_delta_mb: float
    error: str


def parse_jsonl(file_path: Path) -> List[TestResult]:
    """Parse JSONL file into result objects"""
    results = []
    
    with open(file_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            
            try:
                data = json.loads(line)
                results.append(TestResult(**data))
            except (json.JSONDecodeError, TypeError) as e:
                print(f"⚠️  Skipping invalid line: {e}")
    
    return results


def generate_report(results: List[TestResult], output_path: Path):
    """Generate markdown report"""
    
    # Separate by phase
    single_tasks = [r for r in results if r.concurrency == 1]
    concurrent_tasks = [r for r in results if r.concurrency > 1]
    
    # Calculate statistics
    long_audio_results = [r for r in single_tasks if 'long_audio' in r.audio_file]
    short_audio_results = [r for r in single_tasks if 'long_audio' not in r.audio_file]
    
    report = []
    report.append("# Memory Leak & Stress Test Report\n")
    report.append(f"**Generated:** {results[0].timestamp if results else 'N/A'}\n")
    report.append(f"**Total Tests:** {len(results)}\n")
    report.append("")
    
    # ===== Phase 1: Memory Leak Verification =====
    report.append("## Phase 1: Memory Leak Verification\n")
    
    if long_audio_results:
        r = long_audio_results[0]  # Latest long audio test
        
        leak_fixed = r.worker_rss_delta_mb and r.worker_rss_delta_mb < 200
        status_emoji = "✅" if leak_fixed else "⚠️"
        
        report.append(f"### Long Audio Test ({r.audio_file})\n")
        report.append(f"- **Status:** {r.status}")
        report.append(f"- **Processing Time:** {r.processing_time:.1f}s")
        report.append(f"- **RTF:** {r.rtf:.3f}" + (" ✅ (Faster than real-time)" if r.rtf and r.rtf < 1.0 else ""))
        report.append(f"- **Worker RSS Before:** {r.worker_rss_before_mb:.1f} MB")
        report.append(f"- **Worker RSS After:** {r.worker_rss_after_mb:.1f} MB")
        report.append(f"- **Memory Delta:** {r.worker_rss_delta_mb:+.1f} MB {status_emoji}")
        report.append("")
        
        if leak_fixed:
            report.append(f"> [!NOTE]")
            report.append(f"> **Memory Leak Fix VERIFIED** ✅")
            report.append(f"> Memory delta ({r.worker_rss_delta_mb:+.1f} MB) is well below the 200 MB threshold.")
            report.append(f"> Previous issue: +3867 MB → Current: {r.worker_rss_delta_mb:+.1f} MB")
        else:
            report.append(f"> [!WARNING]")
            report.append(f"> **Potential Memory Leak** ⚠️")
            report.append(f"> Memory delta ({r.worker_rss_delta_mb:+.1f} MB) exceeds 200 MB threshold.")
        
        report.append("")
    
    if short_audio_results:
        r = short_audio_results[0]
        report.append(f"### Short Audio Test ({r.audio_file})\n")
        report.append(f"- **Status:** {r.status}")
        rtf_str = f"{r.rtf:.3f}" if r.rtf else "N/A"
        report.append(f"- **RTF:** {rtf_str}")
        mem_str = f"{r.worker_rss_delta_mb:+.1f}" if r.worker_rss_delta_mb else "N/A"
        report.append(f"- **Memory Delta:** {mem_str} MB")
        report.append("")
    
    # ===== Phase 2: Concurrency Tests =====
    if concurrent_tasks:
        report.append("## Phase 2: Concurrency Stress Test\n")
        
        # Group by concurrency level
        concurrency_levels = {}
        for r in concurrent_tasks:
            if r.concurrency not in concurrency_levels:
                concurrency_levels[r.concurrency] = []
            concurrency_levels[r.concurrency].append(r)
        
        max_stable = 0
        for level in sorted(concurrency_levels.keys()):
            tasks = concurrency_levels[level]
            success_count = sum(1 for t in tasks if t.status == 'success')
            failed_count = len(tasks) - success_count
            
            avg_rtf = sum(t.rtf for t in tasks if t.rtf) / len([t for t in tasks if t.rtf]) if any(t.rtf for t in tasks) else None
            
            report.append(f"### Concurrency Level: {level}")
            report.append(f"- **Tasks:** {len(tasks)}")
            report.append(f"- **Success:** {success_count}/{len(tasks)}")
            report.append(f"- **Failed:** {failed_count}")            
            avg_rtf_str = f"{avg_rtf:.3f}" if avg_rtf else "N/A"
            report.append(f"- **Avg RTF:** {avg_rtf_str}")
            
            if failed_count == 0:
                max_stable = level
                report.append(f"- **Result:** ✅ Stable")
            else:
                report.append(f"- **Result:** ⚠️  Unstable")
            
            report.append("")
        
        report.append(f"> [!IMPORTANT]")
        report.append(f"> **Maximum Stable Concurrency:** {max_stable}")
        report.append("")
    
    # ===== Summary Table =====
    report.append("## Detailed Results\n")
    report.append("| Test ID | Audio | Concurrency | Status | RTF | Memory Δ (MB) |")
    report.append("|:--------|:------|:-----------:|:------:|:---:|:-------------:|")
    
    for r in results:
        audio_short = r.audio_file[:20] + "..." if len(r.audio_file) > 20 else r.audio_file
        status_emoji = "✅" if r.status == "success" else "❌"
        rtf_str = f"{r.rtf:.3f}" if r.rtf else "N/A"
        mem_str = f"{r.worker_rss_delta_mb:+.1f}" if r.worker_rss_delta_mb else "N/A"
        
        report.append(
            f"| {r.test_id[:30]}... | {audio_short} | {r.concurrency} | "
            f"{status_emoji} {r.status} | {rtf_str} | "
            f"{mem_str} |"
        )
    
    # Write report
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text('\n'.join(report))
    print(f"✅ Report generated: {output_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze_stress_test.py <jsonl_file>")
        print("\nExample:")
        print("  python analyze_stress_test.py tests/results/memory_leak_stress_test_20251209_231234.jsonl")
        sys.exit(1)
    
    input_file = Path(sys.argv[1])
    
    if not input_file.exists():
        print(f"❌ Error: File not found: {input_file}")
        sys.exit(1)
    
    print(f"📊 Analyzing: {input_file}")
    
    results = parse_jsonl(input_file)
    
    if not results:
        print("❌ No valid results found in file")
        sys.exit(1)
    
    print(f"✅ Parsed {len(results)} test results")
    
    # Generate report
    output_file = input_file.with_suffix('.md')
    generate_report(results, output_file)
    
    print(f"\n📝 View report at: {output_file}")


if __name__ == "__main__":
    main()
