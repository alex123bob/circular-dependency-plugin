const path = require('path')
const http = require('http')
const fs = require('fs')

function startServer(port) {
    const types = {
        html: 'text/html',
        css: 'text/css',
        csv: 'text/csv',
        js: 'application/javascript',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        json: 'application/json',
        xml: 'application/xml'
    }
    const server = http.createServer((req, res) => {
        const extension = path.extname(req.url).slice(1)
        const type = extension ? types[extension] : types.html
        const supportedExtension = Boolean(type)
        if (!supportedExtension) {
            res.writeHead(404, { 'Content-Type': 'text/html' })
            res.end('404: File not found')
            return
        }

        let fileName = req.url
        if (req.url === '/') {
            fileName = 'index.html'
        }

        fs.readFile(path.join(__dirname, fileName), function (err, html) {
            res.writeHead(200, { 'Content-Type': type })
            res.end(html)
        })
    })
    server.listen(port)
}

startServer(6600);