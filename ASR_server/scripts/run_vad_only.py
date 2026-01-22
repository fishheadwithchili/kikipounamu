import os
import argparse
import json
import subprocess
import sys

# Try to import FunASR, handle if missing
try:
    from funasr import AutoModel
except ImportError:
    print(json.dumps({"status": "error", "message": "funasr not installed. Please run this inside the FunASR container."}))
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Standalone VAD Service")
    parser.add_argument("--input", required=True, help="Input audio file path")
    parser.add_argument("--output-dir", help="Output directory for segments")
    parser.add_argument("--device", default="cpu", help="Device to run on")
    parser.add_argument("--max_single_segment_time", type=int, default=60000, help="Max segment time in ms")
    parser.add_argument("--max_end_silence_time", type=int, default=800, help="Max end silence time in ms")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(json.dumps({"status": "error", "message": f"Input file not found: {args.input}"}))
        sys.exit(1)

    # Load model
    # Suppress FunASR logs if possible to keep stdout clean for JSON
    try:
        model = AutoModel(
            model="fsmn-vad",
            model_revision="v2.0.4",
            device=args.device,
            disable_update=True,
            disable_pbar=True,
            verbose=False 
        )
    except Exception as e:
         print(json.dumps({"status": "error", "message": f"Failed to load VAD model: {str(e)}"}))
         sys.exit(1)

    # Inference
    try:
        res = model.generate(
            input=args.input,
            batch_size_s=5000,
            max_single_segment_time=args.max_single_segment_time,
            max_end_silence_time=args.max_end_silence_time
        )
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Inference failed: {str(e)}"}))
        sys.exit(1)
    
    # Debug print if needed (to stderr)
    # sys.stderr.write(str(res) + "\n")

    segments = []
    # Parse result
    # For single file, res is typically: [{'key': 'filename', 'value': [[start, end], ...]}]
    if res and isinstance(res, list) and len(res) > 0:
        val = res[0].get('value')
        if val:
            segments = val

    output_files = []
    
    if args.output_dir:
        if not os.path.exists(args.output_dir):
            os.makedirs(args.output_dir, exist_ok=True)
            
        base_name = os.path.splitext(os.path.basename(args.input))[0]
        
        for i, seg in enumerate(segments):
            start_ms = seg[0]
            end_ms = seg[1]
            # Output filename format: name_seg_0000_START_END.wav
            out_file = os.path.join(args.output_dir, f"{base_name}_seg_{i:04d}_{start_ms}_{end_ms}.wav")
            
            start_sec = start_ms / 1000.0
            end_sec = end_ms / 1000.0
            
            # ffmpeg command
            cmd = [
                "ffmpeg", "-y",
                "-i", args.input,
                "-ss", str(start_sec),
                "-to", str(end_sec),
                "-c", "copy",
                "-loglevel", "error",
                out_file
            ]
            
            try:
                subprocess.run(cmd, check=True, stderr=subprocess.PIPE)
                output_files.append(out_file)
            except subprocess.CalledProcessError as e:
                # Log error to stderr but continue or fail?
                sys.stderr.write(f"Error slicing segment {i}: {e}\n")

    # Output JSON
    result = {
        "status": "success",
        "segments": segments,
        "files": output_files
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
