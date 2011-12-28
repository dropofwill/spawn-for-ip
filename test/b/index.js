var http = require('http')

// take 3 seconds and then start listening

setTimeout(function() {
	http.createServer(function (req, res) {
	  res.writeHead(200)
	  res.end('B: Hello')
	}).listen(process.env.PORT, process.env.HOST)
}, 3000)
