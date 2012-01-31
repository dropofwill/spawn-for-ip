var async = require('async');
var staticports = require('../lib/staticports');
var testCase = require('nodeunit').testCase;

exports.tests = testCase({
	setUp: function(cb) {
		var self = this;

		self.alloc = function(portalloc, key, assertfn) {
			return function(cb) {
				return portalloc.alloc(key, function(err, port) {
					if (assertfn) assertfn(err, port);
					return cb();
				});
			};
		};

		return cb();
	},

	singlePort: function(test) {
		var self = this;
		var portalloc = staticports({ range: [7000, 7000] });
		return series(test, [
			self.alloc(portalloc, 'foo', function(err, port) {
				test.ok(!err, err);
				test.equals(port, 7000);
			}),
			self.alloc(portalloc, 'foo', function(err, port) {
				test.ok(!err, err);
				test.equals(port, 7000);
			}),
			self.alloc(portalloc, 'goo', function(err, port) {
				test.ok(err, "expecting an error");
			}),
			self.alloc(portalloc, 'xoo', function(err, port) {
				test.ok(err, "expecting an error");
			}),
		]);
	},

	twoPorts: function(test) {
		var self = this;
		var portalloc = staticports({ range: [7000, 7001] });
		return series(test, [
			self.alloc(portalloc, 'foo', function(err, port) {
				test.ok(!err, err);
				test.equals(port, 7000);
			}),
			self.alloc(portalloc, 'foo', function(err, port) {
				test.ok(!err, err);
				test.equals(port, 7000);
			}),
			self.alloc(portalloc, 'goo', function(err, port) {
				test.ok(!err, err);
				test.equals(port, 7001);
			}),
			self.alloc(portalloc, 'xoo', function(err, port) {
				test.ok(err, "expecting an error");
			}),
		]);
	},
});

// -- helpers

function series(test, arr) {
	return async.series(arr, function(err) {
		test.ok(!err, err);
		test.done();
	});
}