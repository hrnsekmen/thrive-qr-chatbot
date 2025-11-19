async function sendBinaryVideo(file, messageText, activityId, sessionId) {
    const socket = new WebSocket("ws://...");
    
    // 1. Create Metadata JSON
    const metadata = {
        message: messageText,
        activity_id: activityId,
        session_id: sessionId,
        // No "video" field here, it's appended
    };
    const jsonString = JSON.stringify(metadata);
    const jsonBytes = new TextEncoder().encode(jsonString);
    
    // 2. Read Video File as ArrayBuffer
    const videoBytes = await file.arrayBuffer();
    
    // 3. Pack into one buffer
    const totalLength = 4 + jsonBytes.length + videoBytes.byteLength;
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);
    
    // Write JSON Length (4 bytes, Big Endian)
    view.setUint32(0, jsonBytes.length, false); // false = Big Endian
    
    // Write JSON Bytes
    const byteView = new Uint8Array(buffer);
    byteView.set(jsonBytes, 4);
    
    // Write Video Bytes
    byteView.set(new Uint8Array(videoBytes), 4 + jsonBytes.length);
    
    // 4. Send
    socket.send(buffer);
}