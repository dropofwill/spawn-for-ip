var testCase = require('nodeunit').testCase
var nploy = require('../lib/nploy')
var request = require('request')
var path = require('path')
var common = require('./lib/common')

var TEST_PORT = 4000

if (!common.hostsExistSync(['a.localhost', 'b.localhost', 'c.localhost'])) return

exports.proxy = testCase({
  setUp: function(cb) {
    this.req = function(hostname, callback) { request('http://' + hostname + ':' + TEST_PORT, callback) }
    var opts = {
        dir: __dirname
      , port: TEST_PORT
    }
    this.server = nploy.start(opts, function(err) {
      cb(err)
    })
  }

, tearDown: function(cb) {
    this.server.close()
    cb()
  }

, api: function(test) {
    var functions = [ 'close' ]
    var props = [ 'config', 'router', 'endpoint', 'proxy' ]
    common.apitest(test, this.server, functions, props)
    test.done()
  }

, config: function(test) {
    test.equals(this.server.config, path.join(__dirname, './nploy.cfg'))
    test.done()
  }

, endpoint: function(test) {
    test.deepEqual(this.server.endpoint, { host: '0.0.0.0', port: TEST_PORT })
    test.done()
  }

, notFound: function(test) {
    this.req('localhost', function(err, res, body) {
      test.ok(!err, err)
      test.equals(res.statusCode, 404, "404 is expected when a request is sent to an undefined app")
      test.done()
    })
  }

, appA: function(test) {
    this.req('a.localhost', function(err, res, body) {
      test.ok(!err, err)
      test.equals(res.statusCode, 200)
      test.equals(body, 'A: Hello')
      test.done()
    })
  }

, appB : function(test) {
    this.req('b.localhost', function(err, res, body) {
      test.ok(!err, err)
      test.equals(res.statusCode, 200)
      test.equals(body, 'B: Hello')
      test.done()
    })
  }

, kill: function(test) {
    var self = this

    test.ok(!self.server.router.getchild('a.localhost'), "getchild() should return null for a non started app")

    self.server.router.kill('a.localhost', function(err) {
      test.ok(err, "expecting an error because a is not started yet")

      self.req('a.localhost', function(err, res, body) {
        test.ok(self.server.router.getchild('a.localhost'), "getchild() should return a pid")
        test.ok(res.statusCode, 200)

        self.server.router.kill('a.localhost', function(err) {
          test.ok(!err, err)
          var pid = self.server.router.getchild('a.localhost')
          test.ok(!self.server.router.getchild('a.localhost'), "getchild() should return null for a non started app")
          test.done()
        })
      })
    })
  }
})
