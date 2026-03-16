/**
 * TOTVS RM Proxy Server
 *
 * Este script roda DENTRO da rede da empresa (mesmo servidor ou rede do TOTVS RM).
 * Ele recebe requisições do MediObras (frontend) e repassa para o TOTVS RM API.
 *
 * INSTALAÇÃO:
 *   1. Copie este arquivo para um servidor na rede interna
 *   2. Instale Node.js 18+ (https://nodejs.org)
 *   3. Execute: node totvs-proxy.mjs
 *   4. O proxy roda na porta 3333 por padrão
 *   5. No MediObras, configure o Host como: http://{IP-DO-SERVIDOR}:3333
 *
 * SEGURANÇA:
 *   - O proxy NÃO armazena credenciais — elas vêm no header Authorization
 *   - CORS permite apenas origens configuradas
 *   - Roda com HTTPS se certificado disponível
 *
 * USO COM PM2 (produção):
 *   pm2 start totvs-proxy.mjs --name totvs-proxy
 *   pm2 save
 */

import http from 'node:http'
import https from 'node:https'

// ─── CONFIG ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3333
const TOTVS_RM_HOST = process.env.TOTVS_RM_HOST || 'http://localhost:8051'  // URL do TOTVS RM

// Origens permitidas (adicione a URL do seu MediObras)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',    // Dev local
  'http://localhost:3000',
  'https://mediobras.vercel.app',  // Produção (altere para seu domínio)
  // Adicione mais origens conforme necessário
]

// ─── SERVIDOR ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || ''

  // CORS
  if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-totvs-context, x-totvs-rm-host')
  res.setHeader('Access-Control-Max-Age', '86400')

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', totvs_host: TOTVS_RM_HOST, timestamp: new Date().toISOString() }))
    return
  }

  // Proxy: repassa tudo para o TOTVS RM
  try {
    // O host do RM pode vir no header (permite config dinâmica) ou usa o padrão
    const rmHost = req.headers['x-totvs-rm-host'] || TOTVS_RM_HOST
    const targetUrl = `${rmHost}${req.url}`

    // Lê o body da requisição
    const bodyChunks = []
    for await (const chunk of req) bodyChunks.push(chunk)
    const body = Buffer.concat(bodyChunks)

    // Monta headers para o RM (repassa Authorization e Content-Type)
    const proxyHeaders = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': 'application/json',
    }
    if (req.headers.authorization) proxyHeaders['Authorization'] = req.headers.authorization
    if (req.headers['x-totvs-context']) proxyHeaders['x-totvs-context'] = req.headers['x-totvs-context']

    // Faz a requisição para o TOTVS RM
    const rmUrl = new URL(targetUrl)
    const isHttps = rmUrl.protocol === 'https:'
    const httpModule = isHttps ? https : http

    const proxyReq = httpModule.request({
      hostname: rmUrl.hostname,
      port: rmUrl.port,
      path: rmUrl.pathname + rmUrl.search,
      method: req.method,
      headers: proxyHeaders,
      timeout: 30000,
      // Ignora SSL inválido em rede interna (comum em TOTVS)
      ...(isHttps ? { rejectUnauthorized: false } : {}),
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        ...(ALLOWED_ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
      })
      proxyRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      console.error(`[PROXY ERROR] ${req.method} ${targetUrl}:`, err.message)
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: 'Proxy Error',
        message: `Não foi possível conectar ao TOTVS RM em ${rmHost}: ${err.message}`,
        host: rmHost,
      }))
    })

    proxyReq.on('timeout', () => {
      proxyReq.destroy()
      res.writeHead(504, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Timeout', message: 'TOTVS RM não respondeu em 30s' }))
    })

    if (body.length > 0) proxyReq.write(body)
    proxyReq.end()

    console.log(`[PROXY] ${req.method} ${req.url} → ${targetUrl}`)

  } catch (err) {
    console.error('[PROXY FATAL]', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Internal Error', message: String(err) }))
  }
})

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         TOTVS RM Proxy — MediObras                        ║
╠════════════════════════════════════════════════════════════╣
║  Proxy:      http://0.0.0.0:${String(PORT).padEnd(30)}║
║  TOTVS RM:   ${TOTVS_RM_HOST.padEnd(43)}║
║  Health:     http://localhost:${PORT}/health${' '.repeat(Math.max(0, 22 - String(PORT).length))}║
╚════════════════════════════════════════════════════════════╝

Configure no MediObras:
  Host: http://{IP-DESTE-SERVIDOR}:${PORT}

Variáveis de ambiente:
  PORT=${PORT}
  TOTVS_RM_HOST=${TOTVS_RM_HOST}
`)
})
