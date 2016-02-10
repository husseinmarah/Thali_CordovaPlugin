'use strict';

var PouchDB = require('PouchDB');
var tape = require('../lib/thali-tape');
var testUtils = require('../lib/testUtils.js');
var ThaliNotificationServer =
  require('thali/NextGeneration/thaliNotificationServer');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var express = require('express');
var crypto = require('crypto');
var path = require('path');
var Promise = require('lie');

var test = tape({
  setup: function (t) {
    t.end();
  },
  teardown: function (t) {
    t.end();
  }
});

function getTestPouchDBInstance(name) {
  // Use a folder specific to this test so that the database content
  // will not interfere with any other databases that might be created
  // during other tests.
  var dbPath = path.join(testUtils.tmpDirectory(),
    'pouch-for-testThaliSendNotificationBasedOnReplication-test');
  var LevelDownPouchDB =
    PouchDB.defaults({db: require('leveldown-mobile'), prefix: dbPath});
  return new LevelDownPouchDB(name);
}

/*
start with no peers then stop
 */


function MockThaliNotificationServerGenerator(initFunction) {
  return function (router, ecdhForLocalDevice, millisecondsUntilExpiration) {
    var thaliNotificationServer =
      new ThaliNotificationServer(router, ecdhForLocalDevice,
                                  millisecondsUntilExpiration);
    var mockThaliNotificationServer =
      sinon.mock(thaliNotificationServer);
    initFunction(router, ecdhForLocalDevice, millisecondsUntilExpiration,
                 mockThaliNotificationServer);
    return thaliNotificationServer;
  };
}

/**
 * This is the value outputted by the init function. It returns the mock object
 * for the ThaliNotificationServer as well as the startArg to be used when
 * calling start on the thaliSendNotificationBasedOnReplication object.
 *
 * @typedef {Object} mockInitFunctionOutput
 * @property {Object} mockThaliNotificationServer
 * @property {?Buffer[]} startArg
 */

/**
 * This function will be passed in the PouchDB object being used in the test
 * so that it can set it up.
 *
 * @public
 * @callback pouchDbInitFunction
 * @param {Object} pouchDB
 * @returns {Promise<?Error>}
 */

/**
 * This callback is used to let the test set up the mock, put documents in
 * the DB, check the constructor functions, etc. The values below that start
 * with 'submitted' are the ones that were generated by the test rig and
 * used to create the thaliSendNotificationServer instance. The values that
 * start with used are the values that were passed on by the
 * thaliSendNotificationServer code when calling the ThaliNotificationServer
 * object.
 *
 * @public
 * @callback mockInitFunction
 * @param {Object} submittedRouter
 * @param {Object} usedRouter
 * @param {ECDH} submittedEcdhForLocalDevice
 * @param {ECDH} usedEcdhForLocalDevice
 * @param {number} submittedMillisecondsUntilExpiration
 * @param {number} usedMillisecondsUntilExpiration
 * @param {Object} mock
 * @return {mockInitFunctionOutput}
 */

/**
 * Calls start, lets some user code set things up and then calls finish. The
 // jscs:disable jsDoc
 * ThaliNotificationServer object is fully mocked and so has to be configured
 // jscs:enable jsDoc
 * using the mockInitFunction.
 *
 * @param {Tape} t The tape status reporting object
 * @param {pouchDbInitFunction} pouchDbInitFunction
 * @param {mockInitFunction} mockInitFunction
 */
function testStartAndStop(t, pouchDbInitFunction, mockInitFunction) {
  var router = express.Router();
  var ecdhForLocalDevice = crypto.createECDH('secp521r1').generateKeys();
  var millisecondsUntilExpiration = 100;
  var pouchDB = getTestPouchDBInstance('nopeers');

  pouchDbInitFunction(pouchDB)
    .then(function() {
      var mockThaliNotificationServer = null;
      var startArg = null;
      var MockThaliNotificationServer =
        new MockThaliNotificationServerGenerator(
          function (localRouter, localEcdhForLocalDevice,
                    localMillisecondsUntilExpiration, mock) {
            var initFunctionOutput =
              mockInitFunction(router, localRouter, ecdhForLocalDevice,
                localEcdhForLocalDevice, millisecondsUntilExpiration,
                localMillisecondsUntilExpiration, mock, pouchDB);
            mockThaliNotificationServer =
              initFunctionOutput.mockThaliNotificationServer;
            startArg =
              initFunctionOutput.startArg;
          });

      var ThaliSendNotificationBasedOnReplicationProxyquired =
        proxyquire('thali/NextGeneration/thaliSendNotificationBasedOnReplication',
          { './thaliNotificationServer':
          MockThaliNotificationServer});

      var thaliSendNotificationBasedOnReplication =
        new ThaliSendNotificationBasedOnReplicationProxyquired(router,
          ecdhForLocalDevice, millisecondsUntilExpiration, pouchDB);

      thaliSendNotificationBasedOnReplication.start(startArg)
        .then(function () {
          return thaliSendNotificationBasedOnReplication.stop();
        }).then(function () {
        mockThaliNotificationServer.verify();
        t.end();
      });
    });
}

/**
 *
 * @public
 * @callback limitedInitFunction
 * @param {Object} mock
 * @param {PouchDB} pouchDB
 * @returns {mockInitFunctionOutput}
 */

/**
 * Used in situations where the test should only have the
 // jscs:disable jsDoc
 * ThaliNotificationServer constructor called exactly once and with exactly
 // jscs:enable jsDoc
 * the arguments passed in by the test rig.
 * @public
 * @param {Tape} t
 * @param {limitedInitFunction} initFunction
 * @returns {mockInitFunctionOutput}
 */
function runConstructorOnceAndValidateArgs(t, initFunction) {
  var mockThaliNotificationServer = null;
  return function (submittedRouter, usedRouter,
                   submittedEcdhForLocalDevice, usedEcdhForLocalDevice,
                   submittedMillisecondsUntilExpiration,
                   usedMillisecondsUntilExpiration, mock, pouchDB) {
    if (mockThaliNotificationServer) {
      t.fail('Constructor got called more than once.');
    }

    t.equals(usedRouter, submittedRouter, 'router');
    t.equals(usedEcdhForLocalDevice, submittedEcdhForLocalDevice, 'ecdh');
    t.equals(usedMillisecondsUntilExpiration,
      submittedMillisecondsUntilExpiration,
      'milliseconds');

    mockThaliNotificationServer = mock;

    return initFunction(mock, pouchDB);
  };
}

test('No peers and empty database', function (t) {
  testStartAndStop(t,
    function () { return Promise.resolve(); },
    runConstructorOnceAndValidateArgs(t,
      function (mockThaliNotificationServer) {
        mockThaliNotificationServer.expects('start')
          .once()
          .withArgs([])
          .onFirstCall()
          .returns(Promise.resolve());

        mockThaliNotificationServer.expects('stop')
          .once()
          .withArgs()
          .onFirstCall()
          .returns(Promise.resolve());

        return {
          mockThaliNotificationServer: mockThaliNotificationServer,
          startArg: null
        };
      }));
});

test('One peer and empty DB', function (t) {
  //testStartAndStop(t,
  //  runConstructorOnceAndValidateArgs(t,
  //    function (mockThaliNotificatonServer, pouchDB) {
  //      mockThaliNotificatonServer.expects('start')
  //    }));
  t.end();
});
//
//test('End to end with empty database and empty notification db', function (t) {
//
//});
//
//test('End to end with database with content and empty notification db',
//  function () {
//
//  });
//
//test('End to end with database with content and existing notification db',
//  function () {
//
//  });
//
//test('Make sure start is idempotent if called with the same arguments',
//  function() {
//
//  });
