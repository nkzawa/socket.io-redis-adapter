var util = require('util');
var redis = require('redis');
var Adapter = require('socket.io/lib/adapter');


var slice = Array.prototype.slice;
var broadcast = Adapter.prototype.broadcast;


module.exports = RedisAdapter

util.inherits(RedisAdapter, Adapter);


function RedisAdapter(nsp) {
  if (!(this instanceof RedisAdapter)) {
    return new RedisAdapter(nsp);
  }

  Adapter.call(this, nsp);

  this.pack = JSON.stringify;
  this.unpack = JSON.parse;

  this.pub = redis.createClient();
  this.sub = redis.createClient();

  var self = this;

  this.sub.on('message', function(channel, message) {
    var args = [channel].concat(self.unpack(message))
    self.emit.apply(self, args);
  });

  this.subscribe(nsp.name, function(packet, opts) {
    broadcast.call(self, packet, opts);
  });
}

RedisAdapter.prototype.publish = function(name) {
  var args = slice.call(arguments, 1);
  this.pub.publish(name, this.pack(args));
};

RedisAdapter.prototype.subscribe = function(name, callback) {
  if (!this.listeners(name).length) {
    this.sub.subscribe(name);
  }

  this.on(name, callback);
};

RedisAdapter.prototype.unsubscribe = function(name, callback) {
  if (callback) {
    this.removeListener(name, callback);
  } else {
    this.removeAllListeners(name);
  }

  if (!this.listeners(name).length) {
    this.sub.unsubscribe(name);
  }
};

RedisAdapter.prototype.broadcast = function(packet, opts) {
  this.publish(this.nsp.name, packet, opts);
};

RedisAdapter.prototype.quit = function() {
  this.pub.quit();
  this.sub.quit();
};
