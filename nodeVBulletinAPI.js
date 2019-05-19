'use strict';
const md5 = require('js-md5'),
    os = require('os'),
    request = require('request'),
    _ = require('underscore'),
    Forum = require('./Forum'),
    Inbox = require('./Inbox'),
    Member = require('./Member'),
    Message = require('./Message'),
    Post = require('./Post'),
    Thread = require('./Thread'),
    {version} = require('./package.json');

/**
 *
 */
class VBApi {
    /**
     * Initialize a vb api connection .This needs to be called for the first time
     * @param {string} apiUrl
     * @param {string} apiKey
     * @param {string} platformName
     * @param {string} platformVersion
     * @param {object=} options - A fallback to the old style config
     * @param {string=} options.apiUrl
     * @param {string=} options.apiKey
     * @param {string=} options.platformName
     * @param {string=} options.platformVersion
     */
    constructor(apiUrl, apiKey, platformName, platformVersion, options) {
        this.defaultVars = {
            baseUrl: '', //Needed for cookie related commands
            apiUrl: '',
            apiKey: '',
            clientName: 'nodeVBulletinAPI',
            clientVersion: version,
            uniqueId: ''
        };

        this.clientSessionVars = {
            apiVersion: '',
            apiAccessToken: '',
            sessionHash: '', // Unused?
            apiClientId: '',
            secret: '',
            inited: false,
            error: null
        };

        /**
         * @typedef UserVars
         * @property {string} dbsessionhash
         * @property {number} userid
         * @property {string} username
         * @property {boolean} loggedIn
         * @type {UserVars}
         */
        this.userSessionVars = {
            dbsessionhash: '',
            username: '',
            userid: 0,
            loggedIn: false
        };

        /** @private */
        this.__waitingForInitializationCallback = function () {
        }; // A blank callback to be filled in

        options = options || {};
        options.apiUrl = apiUrl || options.apiUrl || '';
        options.apiKey = apiKey || options.apiKey || '';
        options.platformName = platformName || options.platformName || '';
        options.platformVersion = platformVersion || options.platformVersion || '';

        if (
            options.apiUrl !== ''
            && options.apiUrl !== ''
            && options.platformName !== ''
            && options.platformVersion !== ''
        ) {
            this.__initialize(options);
        } else {
            this.clientSessionVars.error = 'apiInit(): Initialization requires a `apiUrl`, `apiKey`, `platformName`, and `platformVersion`';
            this.__waitingForInitializationCallback(false);
        }
    }

    /**
     * Initialize a vb api connection. This needs to be called for the first time
     * @param {object} options
     * @param {string} options.apiUrl
     * @param {string} options.apiKey
     * @param {string} options.platformName
     * @param {string} options.platformVersion
     * @private
     */
    __initialize(options) {
        let that = this;
        // Run itself as a self invoked promise that is awaited by nothing. callMethod shall wait until this is finished
        (async function __initialize_self() {
            let error = null;
            let result = null;
            let regex_url = /^(?:([A-Za-z]+):)?(\/{0,3})([0-9.\-A-Za-z]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?(?:#(.*))?$/;
            let url_parts = regex_url.exec(options.apiUrl);
            that.defaultVars.baseUrl = that.defaultVars.baseUrl || url_parts[1] + ':' + url_parts[2] + url_parts[3] + '/';
            that.defaultVars.apiUrl = that.defaultVars.apiUrl || options.apiUrl;
            that.defaultVars.apiKey = that.defaultVars.apiKey || options.apiKey;
            that.defaultVars.uniqueId = that.defaultVars.uniqueId || md5(that.defaultVars.clientName + that.defaultVars.clientVersion + options.platformName + options.platformVersion + that.constructor.getMacAddress() + new Date().getTime());

            try {
                /**
                 *
                 * @type {{}}
                 * @property {string} apiversion
                 * @property {string} apiaccesstoken
                 * @property {string} sessionhash
                 * @property {string} apiclientid
                 * @property {string} secret
                 */
                let response = await that.callMethod({
                    method: 'api_init',
                    params: {
                        clientname: that.defaultVars.clientName,
                        clientversion: that.defaultVars.clientVersion,
                        platformname: options.platformName,
                        platformversion: options.platformVersion,
                        uniqueid: that.defaultVars.uniqueId
                    }
                });

                that.clientSessionVars.apiVersion = '';
                that.clientSessionVars.apiAccessToken = '';
                that.clientSessionVars.sessionHash = '';
                that.clientSessionVars.apiClientId = '';
                that.clientSessionVars.secret = '';
                that.clientSessionVars.inited = false;
                if (
                    response.apiversion
                    && response.apiaccesstoken
                    && response.sessionhash
                    && response.apiclientid
                    && response.secret
                ) {
                    that.clientSessionVars.apiVersion = response.apiversion;
                    that.clientSessionVars.apiAccessToken = response.apiaccesstoken;
                    that.clientSessionVars.sessionHash = response.sessionhash;
                    that.clientSessionVars.apiClientId = response.apiclientid;
                    that.clientSessionVars.secret = response.secret;
                    that.clientSessionVars.inited = true;
                    that.__waitingForInitializationCallback(true);
                    result = that;
                }

                if (result === null) {
                    that.clientSessionVars.error = that.constructor.parseErrorMessage(response) || 'TODO ERROR (api connection did not return a session)';
                    that.__waitingForInitializationCallback(false);
                    error = that.clientSessionVars.error;
                }
            } catch (e) {
                that.clientSessionVars.error = e;
                that.__waitingForInitializationCallback(false);
                // reject(e);
                error = e;
            }
            return error || result;
        }());
    }

    /**
     * Will return after #initialize() is complete. Otherwise may reject() after 15 second timeout
     * @param {number=5} waitTime
     * @returns {Promise<void>}
     * @fulfill {void}
     * @reject {string} - Error Reason
     */
    async waitForInitialization(waitTime) {
        let that = this;
        waitTime = waitTime || 5;
        return new Promise(async function (resolve, reject) {
            if (that.clientSessionVars.inited === true) {
                resolve();
            } else if (that.clientSessionVars.error !== null) {
                reject(that.clientSessionVars.error);
            } else {
                /**
                 * @type {number}
                 * @private
                 */
                that.__waitingForInitializationTimeout = setTimeout(
                    function () {
                        that.__waitingForInitializationCallback = function () {
                        }; // Set back to a blank function
                        if (that.clientSessionVars.inited === true) {
                            resolve();
                        } else {
                            reject('Connection could not be achieved due to timed out', that.clientSessionVars.error);
                        }

                    },
                    waitTime * 1000 // x second timeout
                );
                /**
                 * @param {boolean=true} success
                 * @private
                 */
                that.__waitingForInitializationCallback = function (success) {
                    if (that.__waitingForInitializationTimeout) {
                        clearTimeout(that.__waitingForInitializationTimeout);
                    }
                    if (success === false) {
                        reject(that.clientSessionVars.error);
                    } else {
                        resolve();
                    }
                };
            }
        })
    }

    /**
     *
     * @param {object} options
     * @param {string} options.method - Required action to take
     * @param {object<string,string>} [options.params={}] - Optional parameter variables
     * @param {?object<string,string>} [options.cookies] - Optional cookie variables
     * @returns {Promise<{}>}
     * @fulfill {{}}
     * @reject {string} - Error Reason
     */
    async callMethod(options) {
        let that = this;
        let sign = true;
        options = options || {};
        options.params = options.params || {};
        return new Promise(async function (resolve, reject) {
            try {
                if (!options.method) {
                    reject('callMethod(): requires a supplied method');
                    return;
                }

                // Sign all calls except for api_init
                if (options.method === 'api_init') {
                    sign = false;
                }

                // await a valid session before continuing (skipping waiting on __initialize())
                if (sign === true) {
                    await that.waitForInitialization();
                }

                // Gather our sessions variables together
                let reqParams = {
                    api_m: options.method,
                    api_c: that.clientSessionVars.apiClientId, //clientId
                    api_s: that.clientSessionVars.apiAccessToken, //apiAccessToken (may be empty)
                    api_v: that.clientSessionVars.apiVersion //api version
                };
                _.extend(reqParams, options.params); // Combine the arrays

                if (sign === true) {
                    // Generate a signature to validate that we are authenticated
                    if (that.clientSessionVars.inited) {
                        reqParams.api_sig = md5(that.clientSessionVars.apiAccessToken + that.clientSessionVars.apiClientId + that.clientSessionVars.secret + that.defaultVars.apiKey);
                    } else {
                        reject('callMethod(): requires initialization. Not initialized');
                        return;
                    }
                }

                // Create a valid http Request
                let reqOptions = {
                    url: that.defaultVars.apiUrl,
                    formData: reqParams,
                    headers: {
                        'User-Agent': that.defaultVars.clientName
                    }
                };

                // Some command require adding a cookie, we'll do that here
                if (options.cookies) {
                    let j = request.jar();
                    for (let variable in options.cookies) {
                        if (options.cookies.hasOwnProperty(variable)) {
                            let cookieString = variable + '=' + options.cookies[variable];
                            let cookie = request.cookie(cookieString);
                            j.setCookie(cookie, that.defaultVars.baseUrl);
                        }
                    }
                    reqOptions.jar = j;// Adds cookies to the request
                }

                request.post(
                    reqOptions,
                    function (error, response, body) {
                        if (!error && response.statusCode === 200) {
                            resolve(JSON.parse(body));
                        } else {
                            //console.log('No response');
                            reject('callMethod(): no response.');
                        }
                    }
                );
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Attempts to log in a user.
     * @param {string} username - Username
     * @param {string} password - clear text password TODO need to secure this more?
     * @param {object=} options
     * @param {string=} options.username - Ignore, already required at username
     * @param {string=} options.password - Ignore, already required at password
     * @returns {Promise<UserVars>}
     * @fulfill {UserVars}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    async login(username, password, options) {
        options = options || {};
        options.username = username || options.username || '';
        options.password = md5(password || options.password || '');
        return await this.loginMD5('', '', options);
    }

    /**
     *
     * Attempts to log in a user. Requires the password to be pre md5 hashed.
     * @param {string} username - Username
     * @param {string} password - MD5 hashed password TODO need to secure this more?
     * @param {object=} options
     * @param {string=} options.username - Ignore, already required at username
     * @param {string=} options.password - Ignore, already required at password
     * @returns {Promise<UserVars>}
     * @fulfill {UserVars}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    async loginMD5(username, password, options) {
        let that = this;
        options = options || {};
        options.username = username || options.username || {};
        options.password = password || options.password || {};
        return new Promise(async function (resolve, reject) {
            try {
                let response = await that.callMethod(
                    {
                        method: 'login_login',
                        params: {
                            vb_login_username: options.username || '',
                            vb_login_md5password: options.password || ''
                        }
                    }
                );
                /**
                 redirect_login - (NOT A ERROR) Login successful
                 badlogin - Username or Password incorrect. Login failed.
                 badlogin_strikes - Username or Password incorrect. Login failed. You have used {X} out of 5 login attempts. After all 5 have been used, you will be unable to login for 15 minutes.
                 */
                let error = that.constructor.parseErrorMessage(response);
                if (response.session) {
                    that.userSessionVars = response.session;
                    if (error === 'redirect_login') {
                        that.userSessionVars.username = options.username;
                        that.userSessionVars.loggedIn = true;
                    }
                }
                if (error === 'redirect_login') {
                    error = null;
                }
                if (error === null) {
                    resolve(that.userSessionVars);
                } else {
                    reject(error);
                }

            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Attempts to log the user out.
     * @returns {Promise<boolean>} - Returns true on success, otherwise error code is rejected
     * @fulfill {boolean}
     * @reject {string} - Error Reason
     */
    async logout() {
        let that = this;
        return new Promise(async function (resolve, reject) {
            let error;
            try {
                let response = await that.callMethod({
                    method: 'login_logout'
                });
                error = that.constructor.parseErrorMessage(response);
                if (response.session) {
                    that.userSessionVars = response.session;
                    if (error === 'cookieclear') {
                        that.userSessionVars.username = '';
                        that.userSessionVars.loggedIn = false;
                    }
                }
                if (error === 'cookieclear') {
                    error = null;
                }
            } catch (e) {
                reject(e);
            }

            if (error) {
                reject(error);
            } else {
                resolve(true)
            }
        });
    }

    /**
     * Return a Mac address of a network interface for machine identification
     * @returns {string} macAddress
     */
    static getMacAddress() {
        let interfaces = os.networkInterfaces();
        let address = '';
        loop1:
            for (let k in interfaces) {
                if (interfaces.hasOwnProperty(k)) {
                    for (let k2 in interfaces[k]) {
                        if (interfaces[k].hasOwnProperty(k2)) {
                            let addressI = interfaces[k][k2];
                            if (
                                (addressI.family === 'IPv4' || addressI.family === 'IPv6')
                                && addressI.hasOwnProperty('internal')
                                && addressI.internal === false
                                && addressI.hasOwnProperty('mac')
                                && addressI.mac !== '00:00:00:00:00:00'
                            ) {
                                address = addressI.mac;
                                break loop1;
                            }
                        }
                    }
                }
            }
        return address;
    }

    /**
     *
     * @param {object} response - Response object from callMethod()
     * @returns {string || null} status - Error message
     */
    static parseErrorMessage(response) {
        let retur = '';
        if (
            response.hasOwnProperty('response')
            && response.response.hasOwnProperty('errormessage')
        ) {
            if (_.isArray(response.response.errormessage)) {
                retur = response.response.errormessage[0]
            } else {
                retur = response.response.errormessage;
            }
        }
        return retur;
    }

    /**
     * List every Forum and sub forum available to the user.
     * @returns {Promise<Forum[]>} - Array of Forum objects
     * @fulfill {Forum[]}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    getForums() {
        return Forum.getForums(this);
    }

    /**
     * List detailed info about a forum and it's sub-forums and threads
     * @param {number} forumId - Forum id
     * @param {object=} options - Secondary Options
     * @param {number=} options.forumid - Ignore, already required at forumId
     * TODO note additional options
     * @returns {Promise<Forum>} - Returns a Forum object
     * @fulfill {Forum}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    getForum(forumId, options) {
        return Forum.getForum(this, forumId, options);
    }


    /**
     * Attempts to submit a new Post into a specified Thread
     * @param {number} threadId - Thread id
     * @param {string} message - Post Message
     * @param {object=} options
     * @param {boolean=} options.signature  - Optionally append your signature
     * @param {number=} options.threadid - Ignore, already required at threadId
     * @param {string=} options.message - Ignore, already required at message
     * TODO note additional options
     * @returns {Promise<*>} - Returns a unhandled response currently
     * @fulfill {*}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    newPost(threadId, message, options) {
        return Post.newPost(this, threadId, message, options);
    }

    /**
     * Attempts to edit an existing Post
     * @param {number} postId - Post id
     * @param {string} message - Post Message
     * @param {object=} options
     * @param {string=} options.reason - Reason for editing
     * @param {boolean=} options.signature - Optionally append your signature
     * @param {number=} options.postid - Ignore, already required at postId
     * @param {string=} options.message - Ignore, already required at message
     * TODO note additional options
     * @returns {Promise<*>} - Returns a unhandled response currently
     * @fulfill {*}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    editPost(postId, message, options) {
        return Post.editPost(this, postId, message, options);
    }

    /**
     * TODO untested - does not seem to function yet
     * Attempts to delete an existing Post
     * @param {number} postId - Post id
     * @param {number} threadId - Thread id
     * @param {object=} options
     * @param {string=} options.reason - Reason for deleting
     * @param {number=} options.postid - Ignore, already required at postId
     * @param {number=} options.threadid - Ignore, already required at threadId
     * TODO note additional options
     * @returns {Promise<*>} - Returns a unhandled response currently
     * @fulfill {*}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    deletePost(postId, threadId, options) {
        return Post.deletePost(this, postId, threadId, options);
    }

    /**
     * List detailed information about a Thread and it's Posts
     * @param {number} threadId - Thread id
     * @param {object=} options - Secondary Options
     * @param {number=} options.threadid - Ignore, already required at threadId
     * TODO note additional options
     * @returns {Promise<Thread>} - Returns a Thread object
     * @fulfill {Thread}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    getThread(threadId, options) {
        return Thread.getThread(this, threadId, options);
    }

    /**
     * Attempts to submit a new Thread into a specified Forum. This will also be considered the first Post
     * @param {number} forumId - Forum Id
     * @param {string} subject - Post/Thread Subject
     * @param {string} message - Post Message
     * @param {object=} options
     * @param {boolean=} options.signature - Optionally append your signature
     * @param {number=} options.forumid - Ignore, already required at postId
     * @param {string=} options.subject - Ignore, already required at postId
     * @param {string=} options.message - Ignore, already required at postId
     * TODO note additional options
     * @returns {Promise<*>} - Returns a unhandled response currently
     * @fulfill {*}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    newThread(forumId, subject, message, options) {
        return Thread.newThread(this, forumId, subject, message, options);
    }

    /**
     * TODO incomplete - does not seem to function yet
     * Attempts to close a specific Thread. Requires a user to have a 'inline mod' permissions
     * @param {number} threadId - Id of Thread to close
     * @returns {Promise<*>} - Returns a unhandled response currently
     * @fulfill {*}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    modCloseThread(threadId) {
        return Thread.modCloseThread(this, threadId);
    }

    /**
     * TODO incomplete - does not seem to function yet
     * Attempts to open a specific Thread. Requires a user to have a 'inline mod' permissions
     * @param {number} threadId - Id of Thread to open
     * @returns {Promise<*>} - Returns a unhandled response currently
     * @fulfill {*}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    modOpenThread(threadId) {
        return Thread.modOpenThread(this, threadId);
    }

    /**
     * TODO incomplete - does not seem to function yet
     * Attempts to delete a specific Thread. Requires a user to have a 'inline mod' permissions
     * @param {number} threadId - Id of Thread to close
     * @returns {Promise<*>} - Returns a unhandled response currently
     * @fulfill {*}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    modDeleteThread(threadId) {
        return Thread.modDeleteThread(this, threadId);
    }

    /**
     * Get logged in user's Inbox and list of private Messages
     * @param {object=} options
     * @returns {Promise<Inbox>} - Returns an Inbox object
     * @fulfill {Inbox}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    getInbox(options) {
        return Inbox.getInbox(this, options);
    }

    /**
     * Attempts to submit a new Thread into a specified Forum. This will also be considered the first Post
     * @param {Date} date - Delete all messages from before the specified date
     * @param {number=0} folderId - Folder Id, defaults to 0
     * @param {object=} options
     * @param {string=} options.dateline - Ignore, already required at date
     * @param {number=} options.folderid - Ignore, already required at folderId
     * TODO note additional options
     * @returns {Promise<void>} - Returns a unhandled response currently
     * @fulfill {void}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    emptyInbox(date, folderId, options) {
        return Inbox.emptyInbox(this, date, folderId, options)
    }

    /**
     * Get details of a specific Message for the logged in user
     * @param {number} id
     * @param {object=} options
     * @param {number=} options.pmid - Ignore, already required at id
     * @returns {Promise<Message>} - Returns a Message object
     * @fulfill {Message}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    getMessage(id, options) {
        return Message.getMessage(this, id, options);
    }

    /**
     *
     * @param {string} username - Username to send the message to
     * @param {string} title - Message Subject
     * @param {string} message - Message content
     * @param {object=} options
     * @param {boolean=} options.signature - Optionally append your signature
     * @param {string=} options.recipients - Ignore, already required at username
     * @param {string=} options.title - Ignore, already required at title
     * @param {string=} options.message - Ignore, already required at message
     * TODO note additional options
     * @returns {Promise<void>} - Successfully completes if sent. TODO: provide a better response
     * @fulfill {void}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    sendMessage(username, title, message, options) {
        return Message.sendMessage(this, username, title, message, options)
    }

    /**
     * Attempts to retrieve data about a specific user found by username
     * @param {string} username - Username
     * @param {object=} options - Secondary Options
     * @param {string=} options.username - Ignore, already required at username
     * @returns {Promise<Member>} - Returns a Member object
     * @fulfill {Member}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    getMember(username, options) {
        return Member.getMember(this, username, options);
    }
}

module.exports = VBApi;
