console.log('starting a');
console.error('this is an error. env:', process.env.myenv);
var http = require('http');
http.createServer(function(req, res) {
	res.end('this is a sample app: ' + process.env.myenv);
}).listen(process.env.PORT, function(err) {
	if (err) return console.error(err);
	return console.info('started on port ' + process.env.PORT);
});
