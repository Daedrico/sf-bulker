const https = require('https')
const querystring = require('querystring')

/**
 * Requests an access token from Salesforce using the OAuth2 client_credentials flow.
 * @param {{ clientId: string, clientSecret: string, host: string }} options
 * @returns {Promise<{ access_token: string, instance_url: string, token_type: string }>}
 */
const getAccessToken = ({ clientId, clientSecret, host }) => {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })

    const url = new URL('/services/oauth2/token', host)

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 400) {
            reject(new Error(`OAuth2 error [${res.statusCode}]: ${parsed.error} - ${parsed.error_description}`))
          } else {
            resolve(parsed)
          }
        } catch (err) {
          reject(new Error(`Failed to parse OAuth2 response: ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = { getAccessToken }

