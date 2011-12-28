var http = require('http')

// take some time seconds and then start listening
// this is used to verify that even scripts that take some
// lead time to listen work

setTimeout(function() {
	http.createServer(function (req, res) {
	  res.writeHead(200)
	  res.end('B: Hello')
	}).listen(process.env.PORT, process.env.HOST)
}, 1000)
