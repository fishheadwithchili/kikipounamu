#!/usr/bin/env python3
"""简单的 WebSocket 客户端测试脚本，用于测试 ASR 录制"""

import asyncio
import websockets
import json
import base64
import uuid

async def test_recording():
    uri = "ws://localhost:8080/ws/asr"
    
    # 读取测试音频文件
    test_audio_path = "/home/tiger/Projects/ASR_pc_front/recording/20251207_1033_recording.wav"
    with open(test_audio_path, 'rb') as f:
        audio_data = f.read()
    
    # 转换为 base64
    audio_base64 = base64.b64encode(audio_data).decode('utf-8')
    
    async with websockets.connect(uri) as websocket:
        session_id = str(uuid.uuid4())
        print(f"📝 Session ID: {session_id}")
        
        # 1. 发送 start 消息
        start_msg = {
            "action": "start",
            "session_id": session_id
        }
        await websocket.send(json.dumps(start_msg))
        print("✅ 发送 start 消息")
        
        # 接收 ack
        response = await websocket.recv()
        print(f"📥 收到响应: {response}")
        
        # 2. 发送音频块 (模拟分块发送)
        chunk_size = 50000  # 每块 50KB
        chunk_index = 0
        
        for i in range(0, len(audio_base64), chunk_size):
            chunk_data = audio_base64[i:i+chunk_size]
            
            chunk_msg = {
                "action": "chunk",
                "session_id": session_id,
                "chunk_index": chunk_index,
                "audio_data": chunk_data
            }
            
            await websocket.send(json.dumps(chunk_msg))
            print(f"📤 发送块 #{chunk_index} (大小:{len(chunk_data)})")
            
            # 接收 ack
            try:
                ack = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                print(f"📥 收到: {ack[:100]}...")
            except asyncio.TimeoutError:
                print("⏱️  等待响应超时")
            
            chunk_index += 1
            await asyncio.sleep(0.1)  # 模拟真实间隔
        
        # 3. 发送 finish 消息
        finish_msg = {
            "action": "finish",
            "session_id": session_id
        }
        await websocket.send(json.dumps(finish_msg))
        print("✅ 发送 finish 消息")
        
        # 等待最终结果
        print("⏳ 等待最终结果...")
        async for message in websocket:
            msg = json.loads(message)
            print(f"\n📥 收到消息: {json.dumps(msg, ensure_ascii=False, indent=2)}")
            
            if msg.get('type') == 'final_result':
                print("\n" + "="*50)
                print("🎉 最终结果:")
                print(f"  文本: {msg.get('text', '(空)')}")
                print(f"  长度: {len(msg.get('text', ''))}")
                print(f"  时长: {msg.get('duration', 0):.2f}秒")
                print(f"  分块数: {msg.get('chunk_count', 0)}")
                print("="*50)
                break

if __name__ == "__main__":
    asyncio.run(test_recording())
