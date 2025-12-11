import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const WS_URL = 'ws://localhost:8080/ws/asr';
// Use the file provided by the user
const AUDIO_FILE = '/home/tiger/Projects/ASR_pc_front/recording/20251207_1033_recording.wav';

// Chunk size 10s (16000 * 2 * 10) = 320000 bytes
const CHUNK_SIZE = 320000;

async function runTest() {
    if (!fs.existsSync(AUDIO_FILE)) {
        console.error('Audio file not found:', AUDIO_FILE);
        process.exit(1);
    }

    const ws = new WebSocket(WS_URL);
    const sessionId = uuidv4();

    ws.on('open', async () => {
        console.log('Connected to ASR Backend');

        // 1. Send Start
        ws.send(JSON.stringify({
            action: 'start',
            session_id: sessionId
        }));

        // 2. Stream Audio
        const buffer = fs.readFileSync(AUDIO_FILE);
        // On WAV, skip header (44 bytes standard)
        let offset = 44;
        let chunkIndex = 0;

        console.log(`Streaming ${buffer.length} bytes...`);

        while (offset < buffer.length) {
            const end = Math.min(offset + CHUNK_SIZE, buffer.length);
            const chunk = buffer.subarray(offset, end);
            const base64Audio = chunk.toString('base64');

            ws.send(JSON.stringify({
                action: 'chunk',
                session_id: sessionId,
                chunk_index: chunkIndex,
                audio_data: base64Audio
            }));

            chunkIndex++;
            offset += CHUNK_SIZE;

            // Simulate real-time delay (roughly)
            await new Promise(r => setTimeout(r, 10)); // Speed up slightly vs real time
        }

        // 3. Send Finish
        ws.send(JSON.stringify({
            action: 'finish',
            session_id: sessionId
        }));
        console.log('Finished streaming. Waiting for final result...');
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'chunk_result') {
                process.stdout.write(`\rPartial: ${msg.text}`);
            } else if (msg.type === 'final_result') {
                console.log('\n\n--- FINAL RESULT ---');
                console.log(msg.text);
                console.log('--------------------');
                ws.close();
                process.exit(0);
            } else if (msg.type === 'error') {
                console.error('Error from backend:', msg.message);
                process.exit(1);
            }
        } catch (e) {
            console.error('Parse error:', e);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        process.exit(1);
    });
}

runTest();
