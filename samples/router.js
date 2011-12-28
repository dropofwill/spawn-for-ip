var router = require('../lib/nploy').createRouter({ port: 5000, dir: '../test', debug: true })

router.setRoutes({
  'foo': 'a/index.js'
, 'goo': 'b/index.js'
})

router.getRoute('foo', function(err, route) {
  if (err) {
  	console.error('unable to get route for "foo"', err)
  	return
  }

  console.log('Use %s:%d to access "foo"', route.host, route.port)

  router.getRoute('goo', function(err, route) {
  	if (err) {
  		console.error('unable to get route for "goo"', err)
  		return
  	}

	  console.log('Use %s:%d to access "goo"', route.host, route.port)

	  router.close()
  })

  /*

  router.kill('foo', function(err) {
    console.log('"foo" is now dead')
    router.close()
  })*/
})
