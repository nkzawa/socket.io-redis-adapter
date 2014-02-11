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

  this.channelPrefix = 'socket.io' + nsp.name + '/';

  // TODO: enable to change how to pack/unpack messages by options.

  // TODO: enable to set clients by options.
  this.pub = redis.createClient();
  this.sub = redis.createClient();

  var self = this;

  this.sub.on('message', function(channel, message) {
    var ev = self.extractEvent(channel);
    if (!ev) return;

    var args = self.unpack(message);
    if (!util.isArray(args)) return;

    self.emit.apply(self, [ev].concat(args));
  });

  this.subscribe('broadcast', function(packet, opts) {
    broadcast.call(self, packet, opts);
  });
}

RedisAdapter.prototype.pack = JSON.stringify;

RedisAdapter.prototype.unpack = JSON.parse;

RedisAdapter.prototype.publish = function(ev) {
  var args = slice.call(arguments, 1);
  this.pub.publish(this.channel(ev), this.pack(args));
};

RedisAdapter.prototype.subscribe = function(ev, callback) {
  if (!this.listeners(ev).length) {
    this.sub.subscribe(this.channel(ev));
  }

  this.on(ev, callback);
};

RedisAdapter.prototype.unsubscribe = function(ev, callback) {
  if (callback) {
    this.removeListener(ev, callback);
  } else {
    this.removeAllListeners(ev);
  }

  if (!this.listeners(ev).length) {
    this.sub.unsubscribe(this.channel(ev));
  }
};

RedisAdapter.prototype.channel = function(event) {
  return this.channelPrefix + event;
};

RedisAdapter.prototype.extractEvent = function(channel) {
  if (channel.indexOf(this.channelPrefix) === 0) {
    return channel.substr(this.channelPrefix.length);
  }
};

RedisAdapter.prototype.broadcast = function(packet, opts) {
  this.publish('broadcast', packet, opts);
};

RedisAdapter.prototype.quit = function() {
  this.pub.quit();
  this.sub.quit();
};
