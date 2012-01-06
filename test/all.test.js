var path = require('path');
var fs = require('fs');
var request = require('request');
var ctxobj = require('ctxobj');
var async = require('async');
var fsmjs = require('fsmjs');
var debug = fsmjs.debug;
var console = ctxobj.console(require('logule').suppress('trace')).stacktop();



// set this to 'true' and an interactive debugger will be attached.
var interactiveDebugger = false;

//
// read all scripts from ./scripts directory and create a hash
// of all of them, with indication of whether they should succeed or fail
//

var scriptsDir = path.join(__dirname, '../test/scripts');
console.log("scripts directory:", scriptsDir);
var testScripts = {};
fs.readdirSync(scriptsDir)
	.map(function(f) { 
		var desc = { name: f, fail: false };
		if (f[0] === ".") return null; // filter files that start with '.'
		if (!!~f.indexOf('.fail')) desc.fail = true;
		return desc;
	})
	.filter(function(d) { return d; })
	.forEach(function(d) { testScripts[d.name] = d;	});


var tests = {};

// setup code for all tests
tests.setUp = function(cb) {
	var self = this;
	
	self.spinner = require('../main').createSpinner();

	this.spin = function(fileName, callback) {
		console.log('spinning', fileName);

		var script = path.join(scriptsDir, fileName);
		var options = { 
			name: fileName, 
			script: script, 
			logger: console, 
			timeout: 10, 
			attempts: 7  // 7 start attempts before staying in 'faulted' state
		};

		var child = self.spinner.start(options, function(err, port) {
			if (err) console.log(fileName, 'error spinning');
			else console.log(fileName, 'ready on port', port);
			
			return callback(err, port);
		});

		//child.on('stdout', function(data) { console.info('STDOUT:', data.toString()); });
		//child.on('stderr', function(data) { console.error('STDERR:', data.toString()); });

		debug(child, { verbose: true, logger: console, logonly: !interactiveDebugger });

		return child;
	};

	this.stop = function(fileName, callback) {
		console.log('stopping', fileName);
		return self.spinner.stop(fileName, callback);
	};

	this.spinstop = function(fileName, callback) {
		self.spin(fileName, function(err, port) {
			if (err) return callback(new Error("unable to start: " + err.toString()));

			self.stop(fileName, function(err) {
				if (err) return callback(new Error("unable to stop: " + e.toString()));
				callback(null, port);
			});
		});
	};

	cb();
};

// teardown code for all tests
tests.tearDown = function(cb) {
	var self = this;

	// make sure all children are stopped
	
	var children = self.spinner.list();
	for (var n in children) {
		var child = children[n];
		var desc = testScripts[n];
		if (child.state !== "stopped") {
			console.error("child " + child.name + " not stopped", child.state);
		}
	}

	return cb();
};


//
// spin an app and make sure we can send it a request
//

tests.normal = function(test) {
	var self = this;
	self.spin('normal.js', function(err, port) {
		test.ok(!err);
		test.ok(port);
		request('http://localhost:' + port, function(err, res, body) {
			test.ok(!err);
			test.equals(body, 'BBBBBBBBBBBBBB');

			// stop it
			self.stop('normal.js', function(err) {
				test.done();
			});
		});
	});
};

//
// start twice and expect the same port to be returned
//

tests.startTwice = function(test) {
	var self = this;

	self.spin('normal.js', function(err, port) {
		test.ok(!err, err);
		test.ok(port);

		self.spin('normal.js', function(err, port2) {
			test.ok(!err, err);
			test.equals(port, port2);

			self.stop('normal.js', function() {
				test.done();
			});
		});
	});
};

//
// just try to spin a.js 100 times.
//

tests.multi = function(test) {
	var self = this;
	var array = []; for (var i = 0; i < 100; ++i) array.push(i);
	async.forEachSeries(array, function(i, cb) {
		self.spin('a.js', cb);
	}, function(err, ports) {
		self.stop('a.js', function() {
			test.done();
		});
	});
};

//
// start an app that takes a few seconds to bing
// this should work well as it is in the alloted start timeout
//

tests.stalling = function(test) {
	this.spinstop('stalling.js', function(err, port) {
		test.ok(!err, err);
		test.ok(port);
		test.done();
	})
};

//
// try to start an app that fails during load
// expect an error.
//

tests.loadfail = function(test) {
	var self = this;
	self.spin('load.fail.js', function(err, port) {
		test.ok(err);

		// stop it now so it will go back to stopped state
		self.stop('load.fail.js', function(err) {
			test.done();	
		});
	});
}

//
// reach 'faulted' state by trying to spin an app
// that fails to start more than 7 times (options.attempts)
//

tests.faulted = function(test) {
	var self = this;
	var numberOfStartRequests = 15;
	var range = [];

	for (i = 0; i < numberOfStartRequests; ++i) range.push(i);

	var outputStates = [];

	async.forEachSeries(range, function(i, cb) {

		self.spin('load.fail.js', function(err, port) {
			test.ok(err, "start should fail");

			var outputState = self.spinner.get('load.fail.js').state;
			outputStates.push(outputState);
			
			cb();
		});
		
	}, function() {
		var sum = { 'stopped': 0, 'faulted': 0 };
		outputStates.map(function(s) { sum[s]++; });
		test.equals(sum['stopped'], 7, "since we configured 7 attempts");
		test.equals(sum['faulted'], 8, "15-7");
		test.done();
	});
};

//
// run a crazy stress test
// that basically spins random scripts and expects
// everything to be okay. this can get even crazier...
// 

tests.stress = function(test) {
	var self = this;

	var totalRequests = 128;
	var scripts = [];

	for (var i = 0; i < totalRequests; ++i) {
		var index = Math.round(Math.random() * 10000) % Object.keys(testScripts).length;
		var s = testScripts[Object.keys(testScripts)[index]];
		scripts.push(s);
	}

	// collect some stats to set expecations
	var requestsPerScript = {};
	var numberOfScripts = 0;
	var expectedSuccesses = 0;

	scripts.forEach(function(s) {
		requestsPerScript[s.name] = requestsPerScript[s.name] ? requestsPerScript[s.name] + 1 : 1;
		expectedSuccesses += s.fail ? 0 : 1;
	});

	numberOfScripts = Object.keys(requestsPerScript).length;

	console.log('number of scripts:', numberOfScripts);
	console.log('requests per script:', requestsPerScript);

	var successCount = 0;
	var failureCount = 0;
	var ports = {};
	var portsPerScript = {};

	async.forEach(scripts, function(s, cb) {
		
		self.spin(s.name, function(err, port) {
			//console.log('SPIN DONE', s, err, port, cb);
			if (err) {
				failureCount++;
				return cb();
			}

			successCount++;
			if (!portsPerScript[s]) portsPerScript[s] = {};
			portsPerScript[s][port] = true;
			ports[port] = true;

			return cb();
		});

	}, function(err) {
		test.ok(!err, err);

		console.log('Number of success starts:', successCount);
		console.log('Number of failed starts:', failureCount);

		test.deepEqual(successCount, expectedSuccesses, "make sure we have the correct number of successes");
		test.deepEqual(failureCount, totalRequests - expectedSuccesses, "failure count is the remainder");

		console.log("All scripts started: ", ports);
		console.log("Stopping all scripts");
		self.spinner.stopall(function() {
			console.log('all stopped');
			test.done();
		});
	});
};

//
// tests the file monitor feature of the spinner - 
// start a child, update it and see that the process is restarted
// and the new one comes up well.
//

tests.monitor = function(test) {
	
	var self = this;
	var version1 = path.join(scriptsDir, 'a.js');
	var version2 = path.join(scriptsDir, 'normal.js');

	var fileName = Math.round(Math.random() * 1000) + ".js";
	var target = path.join(process.env.TMPDIR, fileName);

	console.log(target);

	//
	// start with version1 (which is a.js)
	//

	copy(version1, target, function(err) {

		//
		// spin it
		//

		var child = self.spinner.start(target, function(err, port1) {
			child.logger = console;
			test.ok(!err, err);
			test.ok(port1);

			console.log('started on port', port1);

			//
			// send a request to the spawned app
			//

			return request('http://localhost:' + port1, function(err, res, body) {

				//
				// verify response is coming from 'AAA...'
				//

				test.equal(body, 'AAAAAAAAAAAAAAAA', "response from version 1");
				console.log('response from version 1:', body);
				
				//
				// now, update the script with version2
				//

				copy(version2, target);


				//
				// after the child is restarted, check that response
				// fits version2.
				//

				child.on('restarted', function(port2) {
					console.log('child restarted. no on port', port2);
					request('http://localhost:' + port2, function(err, res, body) {

						//
						// check that the response now comes from 'BBBB...'
						//

						test.equals(body, 'BBBBBBBBBBBBBB', "response from version 2");
						console.log('response from version 2:', body);

						//
						// okay, we are done. stop
						//

						self.spinner.stop(target, function(err) {
							return test.done();
						});
					});
				});
			});
		});
	});
};

exports.tests = require('nodeunit').testCase(tests);

function copy(source, target, callback) {
	if (!callback) callback = function() { };
	return fs.readFile(source, function(err, data) {
		fs.writeFile(target, data, callback);
	});
}