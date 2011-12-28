var testCase = require('nodeunit').testCase;
var nploy = require('../lib/spinner');
var path = require('path');
var fs = require('fs');
var os = require('os');
var windows = os.platform() === 'win32' ? true : false;

exports.router = testCase({
  setUp: function(cb) {
    this.router = nploy.createRouter({ dir: __dirname, range: [ 7000, 7999 ], output: false, debug: false });
    this.router.setRoute('a.localhost', path.join(__dirname, 'a'));
    this.router.setRoute('b.localhost', path.join(__dirname, 'b'));
    cb();
  }

, tearDown: function(cb) {
    this.router.close();
    cb();
  }

, api: function(test) {
    var functions = [ 'setRoute', 'setRoutes', 'getRoute', 'clearRoutes', 'getchild', 'getpid' ];
    var props = [ 'range', 'idletime', 'options' ];
    apitest(test, this.router, functions, props);
    test.done();
  }

, fields: function(test) {
    test.deepEqual(this.router.range, [7000, 7999]);
    test.deepEqual(this.router.idletime, 15);
    test.done();
  }

, getRouteNotFound: function(test) {
    var self = this;
    self.router.getRoute('x.localhost', function(err, route) {
      test.ok(err, "expecting an error");
      test.ok(!route, "route should be null when there is an error");
      test.done();
    })
  }

, getRouteExists: function(test) {
    var self = this;
    self.router.getRoute('a.localhost', function(err, route) {
      test.ok(!err, err);
      test.ok(route && route.host && route.port);
      test.done();
    })
  }

, getRouteScriptNotFound: function(test) {
    var self = this;
    self.router.setRoute('uu', 'not-found.js');
    self.router.getRoute('uu', function(err, route) {
      test.ok(err, "expecting an error");
      test.ok(!route, "no route");
      test.done();
    })
  }

, loadError: function(test) {
    var self = this;
    self.router.setRoute('c.localhost', path.join(__dirname, 'c'));
    self.router.getRoute('c.localhost', function(err, route) {
      test.ok(err, "expecting an error");
      test.ok(!route);
      test.done();
    })
  }

, absolutePath: function(test) {
    var self = this;
    self.router.setRoute('xxx', path.join(__dirname, 'a', 'index.js'));
    self.router.getRoute('xxx', function(err, route) {
      test.ok(!err, err);
      test.ok(route && route.host && route.port);
      test.done();
    })
  }

, setRoutes: function(test) {
    var self = this;
    self.router.setRoutes({ 'x/z/123.xxx': path.join(__dirname, 'a'), '8899xx!': path.join(__dirname, 'b') });
    self.router.getRoute('x/z/123.xxx', function(err, route) {
      test.ok(!err, err);
      test.ok(route && route.host && route.port);

      self.router.getRoute('8899xx!', function(err, route) {
        test.ok(!err, err);
        test.ok(route && route.host && route.port);
        test.done();
      })
    })
  }

, clearRoutes: function(test) {
    var self = this;
    self.router.clearRoutes();
    self.router.getRoute('a.localhost', function(err, route) {
      test.ok(err);
      test.ok(!route);
      test.done();
    })
  }

, getchild: function(test) {
    var self = this;
    test.ok(!self.router.getchild('a.localhost'));
    self.router.getRoute('a.localhost', function(err, route) {
      test.ok(self.router.getchild('a.localhost'));
      test.done();
    })
  }

, kill: function(test) {
    var self = this;
    test.ok(self.router.kill);
    self.router.setRoute('uu', path.join(__dirname, 'b'));
    self.router.getRoute('uu', function(err, route) {
      test.ok(!err, err);
      test.ok(route);
      test.ok(self.router.getchild('uu'));
      self.router.kill('uu', function(err) {
        test.ok(!err, err);
        test.ok(!self.router.getchild('uu'));
        test.done();
      })
    })
  }

, getpid: function(test) {
    var self = this;
    self.router.getRoute('a.localhost', function(err, route) {
      test.ok(!err, err);
      test.ok(route);
      var pid = self.router.getpid('a.localhost');
      test.ok(pid);

      //
      // kill and expect pid to be null
      //

      self.router.kill('a.localhost', function(err) {
        test.ok(!err, err);
        test.ok(!self.router.getpid('a.localhost'));
        test.done();
      })
    })
  
  }
});

function apitest(test, obj, functions, props) {
  functions.forEach(function(f) {
    test.ok(obj[f], f + " not found");
    test.equal(typeof obj[f], "function", f + " is not a function");
  })

  props.forEach(function(p) { 
    test.ok(obj[p] !== null && obj[p] !== undefined);
  })
}
