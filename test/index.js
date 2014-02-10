var http = require('http').Server;
var io = require('socket.io');
var ioc = require('socket.io-client');
var redis = require('redis');
var expect = require('chai').expect;
var async = require('async');
var RedisAdapter = require('../');


function client(srv, nsp, opts) {
  if ('object' == typeof nsp) {
    opts = nsp;
    nsp = null;
  }
  var addr = srv.address();
  if (!addr) {
    addr = srv.listen().address();
  }
  var url = 'ws://' + addr.address + ':' + addr.port + (nsp || '');
  return ioc(url, opts);
}

describe('socket.io-redis-adapter', function() {
  describe('publish', function() {
    it('should publish', function(done) {
      var client = redis.createClient();
      client.on('message', function(channel, message) {
        message = adapter.unpack(message);
        expect(channel).to.equal('hi');
        expect(message).to.eql(['foo', 'bar']);
        client.quit();
        adapter.quit();
        done();
      });
      client.subscribe('hi');

      var adapter = new RedisAdapter({name: '/nsp'});
      adapter.publish('hi', 'foo', 'bar');
    });
  });

  describe('subscribe', function() {
    it('should subscribe', function(done) {
      var adapter = new RedisAdapter({name: '/nsp'});
      adapter.subscribe('hi', function() {
        expect(Array.prototype.slice.call(arguments)).to.eql(['foo', 'bar']);
        client.quit();
        adapter.quit();
        done();
      });

      var client = redis.createClient();
      client.publish('hi', adapter.pack(['foo', 'bar']));
    });
  });

  describe('broadcast', function() {
    beforeEach(function(done) {
      var self = this;

      async.times(3, function(n, next) {
        var srv = http();
        var sio = io(srv, {adapter: RedisAdapter});

        srv.listen(function() {
          ['/', '/nsp'].forEach(function(name) {
            sio.of(name).on('connection', function(socket) {
              socket.on('join', function(callback) {
                socket.join('room', callback);
              });

              socket.on('socket broadcast', function(data) {
                socket.broadcast.to('room').emit('broadcast', data);
              });

              socket.on('namespace broadcast', function(data) {
                sio.of('/nsp').in('room').emit('broadcast', data);
              });
            });
          });

          async.parallel([
            function(callback) {
              async.times(3, function(n, next) {
                var socket = client(srv, '/nsp', {forceNew: true});
                socket.on('connect', function() {
                  socket.emit('join', function() {
                    next(null, socket);
                  });
                });
              }, callback);
            },
            function(callback) {
              // a socket of the same namespace but not joined in the room.
              var socket = client(srv, '/nsp', {forceNew: true});
              socket.on('connect', function() {
                socket.on('broadcast', function(){
                  throw new Error('Called unexpectedly');
                });
                callback();
              });
            },
            function(callback) {
              // a socket joined in the room but for a different namespace.
              var socket = client(srv, {forceNew: true});
              socket.on('connect', function() {
                socket.on('broadcast', function(){
                  throw new Error('Called unexpectedly');
                });
                socket.emit('join', function() {
                  callback();
                });
              });
            }
          ], function(err, results) {
            next(err, {sio:sio, sockets: results[0]});
          });
        });
      }, function(err, data) {
        self.sio = data.map(function(d) { return d.sio; });
        self.sockets = data.map(function(d) {
          return d.sockets;
        }).reduce(function(a, b) {
          return a.concat(b);
        });
        done(err);
      });
    });

    afterEach(function() {
      // quit all adapters
      this.sio.forEach(function(sio) {
        Object.keys(sio.nsps).forEach(function(name) {
          sio.nsps[name].adapter.quit();
        });
      });
    });

    it('should broadcast from a socket', function(done) {
      async.each(this.sockets.slice(1), function(socket, next) {
        socket.on('broadcast', function(message){
          expect(message).to.equal('hi');
          next();
        });
      }, done);

      var socket = this.sockets[0];
      socket.on('broadcast', function(){
        throw new Error('Called unexpectedly');
      });
      socket.emit('socket broadcast', 'hi');
    });

    it('should broadcast from namespace', function(done) {
      async.each(this.sockets, function(socket, next) {
        socket.on('broadcast', function(message){
          expect(message).to.equal('hi');
          next();
        });
      }, done);

      this.sockets[0].emit('namespace broadcast', 'hi');
    });
  });
});
