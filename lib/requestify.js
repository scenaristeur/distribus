var uuid = require('node-uuid'),
    Promise = require('native-promise-only');

var TIMEOUT = 60000; // ms
// TODO: make timeout a configuration setting

/**
 * Wrap a socket in a request/response handling layer.
 * Requests are wrapped in an envelope with id and data, and responses
 * are packed in an envelope with this same id and response data.
 *
 * The socket is extended with functions:
 *     request(data: *) : Promise.<*, Error>
 *     onrequest(data: *) : Promise.<*, Error>
 *
 * @param {Socket} socket
 * @return {Socket} requestified socket
 */
module.exports = function requestify (socket) {
  return (function () {
    var queue = {};   // queue with requests in progress

    if ('request' in socket) {
      throw new Error('Socket already has a request property');
    }

    var requestified = socket;

    /**
     * Event handler, handles incoming messages
     * @param {Object} event
     */
    socket.onmessage = function onmessage (event) {
      var data = event.data;
      if (data.charAt(0) == '{') {
        var envelope = JSON.parse(data);

        // match the request from the id in the response
        var request = queue[envelope.id];
        if (request) {
          // handle an incoming response
          clearTimeout(request.timeout);
          delete queue[envelope.id];

          // resolve the promise with response data
          if (envelope.error) {
            request.reject(envelope.error);
          }
          else {
            request.resolve(envelope.message);
          }
        }
        else {
          // handle an incoming request
          requestified.onrequest(envelope.message)
              .then(function (message) {
                var response = {
                  id: envelope.id,
                  message: message,
                  error: null
                };
                socket.send(JSON.stringify(response));
              })
              .catch(function (error) {
                var response = {
                  id: envelope.id,
                  message: null,
                  error: error
                };
                socket.send(JSON.stringify(response));
              });
        }
      }
    };

    /**
     * Send a request
     * @param {*} message
     * @returns {Promise.<*, Error>} Returns a promise resolving with the response message
     */
    requestified.request = function request (message) {
      return new Promise(function (resolve, reject) {
        // put the data in an envelope with id
        var id = uuid.v1();
        var envelope = {
          id: id,
          message: message
        };

        // add the request to the list with requests in progress
        queue[id] = {
          resolve: resolve,
          reject: reject,
          timeout: setTimeout(function () {
            delete queue[id];
            reject(new Error('Timeout'));
          }, TIMEOUT)
        };

        socket.send(JSON.stringify(envelope));
      });
    };

    /**
     * Handle an incoming request.
     * @param {*} request   Request message
     * @returns {Promise.<*, Error>} Resolves with a response
     */
    requestified.onrequest = function onrequest (request) {
      // this function must be implemented by the socket
      return new Promise(function (resolve, reject) {
        reject('No onrequest handler implemented');
      });
    };

    // TODO: disable send and onmessage on the requestified socket

    return requestified;
  })();
};