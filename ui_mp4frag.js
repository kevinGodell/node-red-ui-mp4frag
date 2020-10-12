'use strict';

module.exports = RED => {
  const { _ } = RED; // locale string getter

  const { createNode, getNode, registerType } = RED.nodes;

  const { addWidget } = RED.require('node-red-dashboard')(RED);

  const { uiMp4fragHlsJsUrl = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js' } = RED.settings;

  const NODE_TYPE = 'ui_mp4frag';

  const initController = require('./lib/initController.js');

  class UiMp4fragNode {
    constructor(config) {
      createNode(this, config);

      this.group = config.group;

      this.order = config.order || 0;

      this.width = config.width;

      this.height = config.height;

      this.hlsJsConfig = config.hlsJsConfig;

      this.errorPoster = config.errorPoster;

      this.readyPoster = config.readyPoster;

      this.autoplay = config.autoplay;

      this.restart = config.restart;

      this.videoID = `video_${NODE_TYPE}_${this.id}`;

      this.videoOptions = 'muted playsinline'; // todo: user configurable

      this.videoStyle = 'width:100%;height:100%;'; // todo: user configurable

      this.divStyle = 'padding:0;margin:0;width:100%;height:100%;overflow:hidden;border:1px solid grey;'; // todo: user configurable

      try {
        this.uiGroupNodeExists(); // throws

        this.sanitizeHlsJsConfig(); // throws

        UiMp4fragNode.addToHead(); // adds the script to the head (only once)

        this.addToBody(); // adds the html markup to the body

        this.on('close', this.onClose); // listen to the close event

        this.status({ fill: 'green', shape: 'ring', text: _('ui_mp4frag.info.ready') });
      } catch (err) {
        this.error(err);

        this.status({ fill: 'red', shape: 'dot', text: err.toString() });
      }
    }

    uiGroupNodeExists() {
      const node = getNode(this.group);

      const type = node && node.type;

      if (type !== 'ui_group') {
        throw new Error(_('ui_mp4frag.error.invalid_ui_group'));
      }
    }

    static addToHead() {
      ++this.nodeCount;

      if (this.nodeCount === 1 && this.headDone === undefined) {
        this.headDone = addWidget({
          node: '',
          group: '',
          order: 0,
          width: 0,
          height: 0,
          format: this.renderInHead(),
          templateScope: 'global', // global causes `format` to be inserted in <head>
          emitOnlyNewValues: false,
          forwardInputMessages: false,
          storeFrontEndInputAsState: false,
        });
      }
    }

    static removeFromHead() {
      --this.nodeCount;

      if (this.nodeCount === 0 && typeof this.headDone === 'function') {
        this.headDone();

        this.headDone = undefined;
      }
    }

    addToBody() {
      this.bodyDone = addWidget({
        node: this,
        group: this.group,
        order: this.order,
        width: this.width,
        height: this.height,
        format: this.renderInBody(),
        templateScope: 'local', // local causes `format` to be inserted in <body>
        emitOnlyNewValues: false,
        forwardInputMessages: false, // true = we do not need to listen to on input event and manually forward msg
        storeFrontEndInputAsState: false,
        persistantFrontEndValue: true,
        convertBack: value => {
          // console.log('convert back', {value});
          return value;
        },
        beforeEmit: (msg, value) => {
          // console.log('before emit', {msg}, {value});
          return { msg };
        },
        beforeSend: (msg, orig) => {
          // console.log('before send', {msg}, {orig});
          if (orig) {
            return orig.msg;
          }
        },
        initController: initController,
      });
    }

    removeFromBody() {
      if (typeof this.bodyDone === 'function') {
        this.bodyDone();

        this.bodyDone = undefined;
      }
    }

    onClose(removed, done) {
      this.removeListener('close', this.onClose);

      UiMp4fragNode.removeFromHead();

      this.removeFromBody();

      if (removed) {
        this.status({ fill: 'red', shape: 'ring', text: _('ui_mp4frag.info.removed') });
      } else {
        this.status({ fill: 'red', shape: 'dot', text: _('ui_mp4frag.info.closed') });
      }

      done();
    }

    static renderInHead() {
      return String.raw`<script id="${NODE_TYPE}_hls_js" type="text/javascript" src="${uiMp4fragHlsJsUrl}"></script>`;
      // return String.raw`<script>const ${NODE_TYPE}_script = document.createElement('script');${NODE_TYPE}_script.type = 'text/javascript';${NODE_TYPE}_script.src = '${uiMp4fragHlsJs}';${NODE_TYPE}_script.async = false;${NODE_TYPE}_script.defer = false;const ${NODE_TYPE}_head = document.getElementsByTagName('head')[0];${NODE_TYPE}_head.appendChild(${NODE_TYPE}_script);</script>`;
    }

    renderInBody() {
      const initObj = {
        readyPoster: this.readyPoster,
        errorPoster: this.errorPoster,
        autoplay: this.autoplay,
        restart: this.restart,
        hlsJsConfig: this.hlsJsConfig,
        videoID: this.videoID,
      };

      const initObjStr = JSON.stringify(initObj);

      return String.raw`<div style="${this.divStyle}" ng-init='init(${initObjStr})'>
        <video id="${this.videoID}" style="${this.videoStyle}" poster="${this.readyPoster}" ${this.videoOptions}></video>
      </div>`;
    }

    static jsonParse(str) {
      try {
        const value = JSON.parse(str);
        const type = typeof value;
        return [value, type];
      } catch (err) {
        return [undefined, 'undefined'];
      }
    }

    sanitizeHlsJsConfig() {
      const [value, type] = UiMp4fragNode.jsonParse(this.hlsJsConfig);

      if (type === 'object' && value !== null) {
        this.hlsJsConfig = value;
      } else {
        throw new Error(_('ui_mp4frag.error.invalid_hls_js_config'));
      }
    }
  }

  UiMp4fragNode.nodeCount = 0; // increment in (successful) constructor, decrement on close event

  const UiMp4fragMeta = {
    settings: {
      uiMp4fragHlsJsUrl: { value: uiMp4fragHlsJsUrl, exportable: true },
    },
  };

  registerType(NODE_TYPE, UiMp4fragNode, UiMp4fragMeta);
};
