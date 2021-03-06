/*
 * Copyright 2013 Jive Software
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

/**
 * This is the network client. You may override specific servers by setting
 * environment variables, for example:
 *
 * jive.jiveid.servers.public=http://myjive:4000
 *
 * This will configure the client to use a different endpoint for Jive ID public.
 */

var jive = require('../../api');
var util = require('util');

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Private

var configuration = {
    "jiveid": {
        "servers": {
            "public": "https://jive-id-public.jiveon.com"
        }
    }
};

var JIVE_OAUTH2_TOKEN_REQUEST_PATH = "/oauth2/token";
var SECURITY_STRING = "throw 'allowIllegalResourceCall is false.';\n";

var requestMaker = function (method, server, path, params) {
    var override = process.env['jive_jiveid_servers_' + server];
    var serverUrl = override || configuration['jiveid']['servers'][server];
    var url = serverUrl + path;

    return jive.util.buildRequest(url, method, params['postObject'], params['headers']);
};

var jiveIDEndpointProvider = {

    requestAccessToken: function (accessTokenRequest) {
        return requestMaker("POST", "public", "/v1/oauth2/token", {
            "postObject": accessTokenRequest,
            "headers": {
                "Content-Type": "application/json"
            }
        });
    }
};

var tilePush = function (method, tileInstance, data, pushURL) {
    var auth = 'Bearer ' + tileInstance['accessToken'];
    var reqHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': auth
    };

    return jive.util.buildRequest(pushURL, method, data, reqHeaders);
};

var tileFetch = function (tileInstance, fetchURL) {
    var auth = 'Bearer ' + tileInstance['accessToken'];
    var reqHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': auth
    };

    return jive.util.buildRequest(fetchURL, 'GET', null, reqHeaders);
};

exports.tileFetch = tileFetch;


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Public

/**
 * Utility for making generic GET request to Jive using auth header from tile instance. Attempts to resolve the promise
 * to the actual data in the response, not the response object. Has to strip out the security string from Jive.
 *
 * If this fails, returns the original response, so be careful to check if obj.statusCode exists in your callback.
 */
exports.getWithTileInstanceAuth = function (tileInstance, url) {
    return tileFetch(tileInstance, url ).then(function (response) {
        if (!response.entity || !response.entity.body) {
            return response;
        }

        var body = response.entity.body;
        if (body.indexOf(SECURITY_STRING) === 0) {
            response.entity.body = body = body.substring(SECURITY_STRING.length);
        }
        try {
            response.entity = JSON.parse(body);
        }
        catch (e) {
            //Do nothing, was not valid JSON object so response.entity.body will contain body string
        }
        return response;
    });
};

exports.requestAccessToken = function (options, successCallback, failureCallback) {
    var accessTokenRequest = {
        client_id: options['client_id'],
        code: options['code'],
        grant_type: 'authorization_code'
    };

    try {
        if ( !options.jiveUrl ) {
            // if not working directly with a jive instance, then use jiveID to broker trust
            var request = jiveIDEndpointProvider.requestAccessToken(accessTokenRequest);
            request.then(successCallback, failureCallback);
        } else {
            // otherwise we deal directly with jive
            var tokenRequestEndPoint = options.jiveUrl + JIVE_OAUTH2_TOKEN_REQUEST_PATH;
            var auth = "Basic " + new Buffer(accessTokenRequest.client_id + ':' + options.client_secret).toString('base64');
            var headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": auth
            };

            jive.util.buildRequest(tokenRequestEndPoint, "POST", accessTokenRequest, headers)
                .then(successCallback, failureCallback);
        }
    }
    catch (e) {
        if (failureCallback) {
            failureCallback(e);
        }
        else {
            jive.logger.error("Error requesting access token!", e);
        }
    }
};

exports.refreshAccessToken = function (options, successCallback, failureCallback) {
    var accessTokenRequest = {
        client_id: options['client_id'],
        refresh_token: options['refresh_token'],
        grant_type: 'refresh_token'
    };

    try {
        if ( !options.jiveUrl ) {
            // if not working directly with a jive instance, then use jiveID to broker trust
            var request = jiveIDEndpointProvider.requestAccessToken(accessTokenRequest);
            request.then(successCallback, failureCallback);
        } else {
            // otherwise we deal directly with jive
            var tokenRequestEndPoint = options.jiveUrl + JIVE_OAUTH2_TOKEN_REQUEST_PATH;
            var auth = "Basic " + new Buffer(accessTokenRequest.client_id + ':' + options.client_secret).toString('base64');
            var headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": auth
            };

            jive.util.buildRequest(tokenRequestEndPoint, "POST", accessTokenRequest, headers)
                .then(successCallback, failureCallback);
        }
    }
    catch (e) {
        if (failureCallback) {
            failureCallback(e);
        }
        else {
            jive.logger.error("Error requesting refresh token!", e);
        }
    }
};

exports.pushData = function (tileInstance, data) {
    return tilePush('PUT', tileInstance, data, tileInstance['url']);
};

exports.pushActivity = function (tileInstance, activity) {
    return tilePush('POST', tileInstance, activity, tileInstance['url']);
};

exports.pushComment = function (tileInstance, comment, commentURL) {
    return tilePush('POST', tileInstance, comment, commentURL);
};

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

var extractExternalPropsUrl = function( instance ) {
    var instanceURL = instance['url'];
    if ( endsWith(instanceURL, '/data') ) {
        return instanceURL.match(/(.+)\/data/)[1] + '/extprops';
    }
    if ( endsWith(instanceURL, '/activities') ) {
        return instanceURL.match(/(.+)\/activities/)[1] + '/extprops';
    }

    throw new Error( 'Could not extract external props url from instance' );
};


var makeExternalPropsHeader = function(instance ) {
    var auth = 'Bearer ' + instance['accessToken'];
    return { 'X-Client-Id': jive.context.config['clientId'], 'Authorization' : auth };
};

exports.fetchExtendedProperties = function( instance ) {
    return jive.util.buildRequest( extractExternalPropsUrl( instance ),
        'GET', null, makeExternalPropsHeader(instance) );
};

exports.pushExtendedProperties = function( instance, props ) {
    return jive.util.buildRequest( extractExternalPropsUrl( instance ),
        'POST', props, makeExternalPropsHeader(instance)  );
};

exports.removeExtendedProperties = function( instance ) {
    return jive.util.buildRequest( extractExternalPropsUrl( instance ),
        'DELETE', null, makeExternalPropsHeader(instance) );
};
