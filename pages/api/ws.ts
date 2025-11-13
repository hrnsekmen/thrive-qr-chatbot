import type { NextApiRequest, NextApiResponse } from 'next';
import { WebSocketServer } from 'ws';

type InboundMessage = {
  activity_id?: string;
  session_id?: string | null;
  message?: string;
  time?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_meta?: any;
};

// Initialize a single WebSocket server and attach to the underlying Node server.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const anyServer = res.socket?.server as any;
  if (!anyServer) {
    res.status(500).end('Server not ready');
    return;
  }

  if (anyServer.__ondemand_wss) {
    res.status(200).end('ok');
    return;
  }

  const wss = new WebSocketServer({ noServer: true });
  anyServer.__ondemand_wss = wss;

  anyServer.on('upgrade', (request: any, socket: any, head: any) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = url.pathname || '';
      // Only handle upgrades for /ws/ondemand/{clientId}
      if (!pathname.startsWith('/ws/ondemand/')) {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      // Ignore malformed URLs
    }
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const clientId = url.pathname.split('/').pop() || 'unknown';

    ws.on('message', (raw) => {
      let payload: InboundMessage;
      try {
        payload = JSON.parse(String(raw)) as InboundMessage;
      } catch {
        payload = { message: String(raw) };
      }
      const base = (payload.message ?? '').toString().trim();
      const reply =
        base.length > 0 ? `Echo (${clientId}): ${base}` : `Hello from server (${clientId})`;

      // Example of parsing fields per requested contract
      const _activityId = payload.activity_id;
      const _sessionId = payload.session_id ?? null;
      const _timeNow = payload.time ?? null;
      const _userMeta = payload.user_meta ?? null;
      void _activityId;
      void _sessionId;
      void _timeNow;
      void _userMeta;

      // Stream word-by-word
      const words = reply.split(/(\s+)/);
      let i = 0;
      const tick = () => {
        if (i < words.length) {
          const token = words[i++];
          try {
            ws.send(JSON.stringify({ type: 'message', content: token }));
          } catch {
            // ignore send errors
          }
          setTimeout(tick, 50);
        } else {
          try {
            ws.send(JSON.stringify({ type: 'message', isComplete: true }));
          } catch {
            // ignore
          }
        }
      };
      tick();
    });
  });

  res.status(200).end('ok');
}

export const config = {
  api: {
    bodyParser: false,
  },
};


