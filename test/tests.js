var testCase = require('nodeunit').testCase;
var nploy = require('../lib/spinner');
var path = require('path');
var fs = require('fs');
var os = require('os');
var windows = os.platform() === 'win32' ? true : false;

exports.spinner = testCase({
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
    self.router.getRoute('x.localhost', function(err, port, child) {
      test.ok(err, "expecting an error");
      test.ok(!port, "route should be null when there is an error");
      test.ok(!child);
      test.done();
    })
  }

, getRouteExists: function(test) {
    var self = this;
    self.router.getRoute('a.localhost', function(err, port) {
      test.ok(!err, err);
      test.ok(port);
      test.done();
    })
  }

, getRouteScriptNotFound: function(test) {
    var self = this;
    self.router.setRoute('uu', 'not-found.js');
    self.router.getRoute('uu', function(err, port, child) {
      test.ok(err, "expecting an error");
      test.ok(!port, "no route");
      test.ok(!child);
      test.done();
    })
  }

, loadError: function(test) {
    var self = this;
    self.router.setRoute('c.localhost', path.join(__dirname, 'c'));
    self.router.getRoute('c.localhost', function(err, port, child) {
      test.ok(err, "expecting an error");
      test.ok(!port);
      test.ok(!child)
      test.done();
    })
  }

, absolutePath: function(test) {
    var self = this;
    self.router.setRoute('xxx', path.join(__dirname, 'a', 'index.js'));
    self.router.getRoute('xxx', function(err, port, child) {
      test.ok(!err, err);
      test.ok(port);
      test.ok(child);
      test.done();
    })
  }

, setRoutes: function(test) {
    var self = this;
    self.router.setRoutes({ 'x/z/123.xxx': path.join(__dirname, 'a'), '8899xx!': path.join(__dirname, 'b') });
    self.router.getRoute('x/z/123.xxx', function(err, port, child) {
      test.ok(!err, err);
      test.ok(port);
      test.ok(child);

      self.router.getRoute('8899xx!', function(err, port, child) {
        test.ok(!err, err);
        test.ok(port);
        test.ok(child);
        test.done();
      })
    })
  }

, setRouteWithOptions: function(test) {
    var self = this;

    //
    // If we pass an object to setRoute instead of a string, options
    // will be passed to 'forever'. this will cause forever to restart the script if
    // it exists.
    //

    var options = { 
      script: path.join(__dirname, 'a'), 
      options: ['extraOptions','inCommandLine'],
    };

    self.router.setRoute('goo', options);
    self.router.getRoute('goo', function(err, port, child) {
      test.ok(!err, err);
      test.ok(port);
      test.deepEqual(child.data.options, ['extraOptions', 'inCommandLine']);

      test.done();
    });
  }

, clearRoutes: function(test) {
    var self = this;
    self.router.clearRoutes();
    self.router.getRoute('a.localhost', function(err, port, child) {
      test.ok(err);
      test.ok(!port);
      test.ok(!child);
      test.done();
    })
  }

, getchild: function(test) {
    var self = this;
    test.ok(!self.router.getchild('a.localhost'));
    self.router.getRoute('a.localhost', function(err, port) {
      test.ok(self.router.getchild('a.localhost'));
      test.done();
    })
  }

, kill: function(test) {
    var self = this;
    test.ok(self.router.kill);
    self.router.setRoute('uu', path.join(__dirname, 'b'));
    self.router.getRoute('uu', function(err, port, child) {
      test.ok(!err, err);
      test.ok(port);
      test.ok(child);
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
    self.router.getRoute('a.localhost', function(err, port, child) {
      test.ok(!err, err);
      test.ok(port);
      test.ok(child);
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
