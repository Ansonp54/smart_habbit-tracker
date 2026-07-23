import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only proxy for the AI Insights feature: keeps ANTHROPIC_API_KEY on the
// server side instead of exposing it in browser JS.
function insightsApiPlugin(apiKey) {
  return {
    name: 'insights-api',
    configureServer(server) {
      server.middlewares.use('/api/insights', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        if (!apiKey) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set. Add it to habit-logbook/.env' }))
          return
        }

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {}

          const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
          })
          const data = await upstream.json()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), insightsApiPlugin(env.ANTHROPIC_API_KEY)],
    server: {
      host: true, // listen on the LAN, not just localhost, so phones on the same WiFi can reach it
    },
  }
})
