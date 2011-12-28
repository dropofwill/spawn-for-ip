var http = require('http')

console.log('starting A on port', process.env.PORT)

http.createServer(function (req, res) {
  console.log('new request to A')
  res.writeHead(200)
  res.end('A: Hello')
}).listen(process.env.PORT, process.env.HOST)
