import {VBApi, CallMethodParameters} from './VBApi';

export interface MessageGetOptions extends CallMethodParameters {
    pmid?: number
}

export interface MessageCreateOptions extends CallMethodParameters {
    signature?: boolean | '0' | '1'
    recipients?: string
    title?: string
    message?: string
}

export interface RawMessageData {
    HTML: {
        bccrecipients: any[],
        ccrecipients: any[],
        pm: {
            pmid: string,
            title: string,
            recipients: string, //'UserHere ; ' possibly delimited by ;
            savecopy: string, // 0 (noting as string just to be able to parseInt)
            folderid: string, // '0'
            fromusername: string
        },
        postbit: {
            show: any, // object
            post: {
                statusicon: 'new' | 'old' | 'replied',
                posttime: string,
                checkbox_value: string, //(noting as string just to be able to parseInt)
                onlinestatusphrase: string, //'x_is_online_now'
                userid: string, //(noting as string just to be able to parseInt)
                username: string,
                avatarurl: string,  //'customavatars/avatar0000_14.gif'
                onlinestatus: {
                    onlinestatus: string // 0 (noting as string just to be able to parseInt)
                },
                usertitle: string,
                joindate: string,
                title: string, //Message title
                message: string,
                message_plain: string,
                message_bbcode: string,
                signature: string,
            }
        }
    }
}

class Message {
    private rawData: RawMessageData;
    private id: number;
    private folderId: number;
    private recipients: string;
    private title: string;
    private message: string;
    private messagePlain: string;
    private messageBBCode: string;
    status: string;
    private time: Date;

    private userId: number;
    private username: string;
    private user: { joinDate: Date; signature: string; avatarUrl: any; online: boolean; id: number; title: string; username: string };


    /**
     *
     * @param {RawMessageData} rawData
     */
    constructor(rawData: RawMessageData) {
        this.rawData = rawData;
        this.parseData();
        this.cleanup();
    };

    private parseData() {
        if (this.rawData
            && this.rawData.hasOwnProperty('HTML')
            && this.rawData.HTML.hasOwnProperty('pm')
            && this.rawData.HTML.hasOwnProperty('postbit')
            && this.rawData.HTML.postbit.hasOwnProperty('post')
        ) {
            const pm = this.rawData.HTML.pm;
            const post = this.rawData.HTML.postbit.post;

            this.id = parseInt(pm.pmid); // number
            this.folderId = parseInt(pm.folderid);
            this.recipients = pm.recipients; // FIXME need to parse this
            this.title = post.title || pm.title;
            this.message = post.message;
            this.messagePlain = post.message_plain;
            this.messageBBCode = post.message_bbcode;
            this.status = post.statusicon;
            this.time = new Date(parseInt(post.posttime) * 1000);


            this.userId = parseInt(post.userid);
            this.username = pm.fromusername;
            this.user = {
                id: parseInt(post.userid),
                username: post.username,
                title: post.usertitle,
                signature: post.signature,
                avatarUrl: post.avatarurl,
                online: !!parseInt(post.onlinestatus.onlinestatus),
                joinDate: new Date(parseInt(post.joindate) * 1000),
            };
        }
    };

    private cleanup() {
        delete this.rawData;
    };

    /**
     * Get details of a specific Message for the logged in user
     * @param vbApi - VBApi
     * @param id - MessageId
     * @param options
     * @fulfill {Message}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    static async get(vbApi: VBApi, id: number, options?: MessageGetOptions): Promise<Message> {
        options = options || {};
        options.pmid = id || options.pmid || 0; //required

        return new Promise(async function (resolve, reject) {
            let message = null;
            try {
                let response = await vbApi.callMethod({
                    method: 'private_showpm',
                    params: options
                });
                if (
                    response
                    && response.hasOwnProperty('response')
                ) {
                    message = new Message(response.response);
                }

                if(message == null){
                    reject();
                }
                resolve(message);
            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Send a new Message to a Member
     * @param vbApi - VBApi
     * @param username - Username to send the message to
     * @param title - Message Subject
     * @param message - Message content
     * @param options
     * @param options.signature - Optionally append your signature
     * @TODO note additional options
     * @fulfill {void}
     * @reject {string} - Error Reason. Expects: (TODO list common errors here)
     */
    static async create(vbApi: VBApi, username:string, title: string, message: string, options?: MessageCreateOptions) {
        options = options || {};
        options.recipients = username || options.recipients || ''; //required
        options.title = title || options.title || ''; //required
        options.message = message || options.message || ''; //required
        options.signature = options.signature === true ? '1' : '0';

        return new Promise(async function (resolve, reject) {
            try {
                let response = await vbApi.callMethod({
                    method: 'private_insertpm',
                    params: options
                });
                let possibleError = VBApi.parseErrorMessage(response);
                if (possibleError !== 'pm_messagesent') {
                    reject(possibleError || response);
                }

                resolve(); // TODO: provide a better response
            } catch (e) {
                reject(e);
            }

        });
    }
}