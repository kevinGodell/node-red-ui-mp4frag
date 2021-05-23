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

      this.players = config.players;

      this.errorPoster = config.errorPoster;

      this.readyPoster = config.readyPoster;

      this.play = config.play;

      this.unload = config.unload;

      this.retry = config.retry;

      this.threshold = config.threshold;

      this.videoID = `video_${NODE_TYPE}_${this.id}`;

      this.videoOptions = 'preload="metadata" muted playsinline'; // disablePictureInPicture'; // todo: user configurable

      try {
        this.uiGroupNodeExists(); // throws

        this.sanitizeHlsJsConfig(); // throws

        this.sanitizePlayers(); // throws

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
        beforeEmit: (msg, payload) => {
          // console.log('before emit');
          if (!payload) {
            this.status({ fill: 'green', shape: 'ring', text: _('ui_mp4frag.info.unloaded') });
          } else {
            this.status({ fill: 'green', shape: 'dot', text: _('ui_mp4frag.info.loaded') });
          }
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
      return String.raw`
<script id="${UiMp4fragNode.type}_hls_js" type="text/javascript" src="${uiMp4fragHlsJsUrl}"></script>
<style>
  .nr-dashboard-ui_mp4frag {
    padding: 0;
    overflow: hidden;
  }
  .container-ui_mp4frag {
    width: 100%;
    height: 100%;
  }
  .video-ui_mp4frag {
    width: 100%;
    height: 100%;
    object-fit: fill;
  }
</style>`;
    }

    renderInBody() {
      const initObj = {
        readyPoster: this.readyPoster,
        errorPoster: this.errorPoster,
        play: this.play,
        unload: this.unload,
        retry: this.retry,
        threshold: this.threshold,
        hlsJsConfig: this.hlsJsConfig,
        videoID: this.videoID,
        players: this.players,
      };

      const initObjStr = JSON.stringify(initObj);

      return String.raw`<div class="container-ui_mp4frag" ng-init='init(${initObjStr})'>
        <video class="video-ui_mp4frag" id="${this.videoID}" poster="${this.readyPoster}" ${this.videoOptions}></video>
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

    sanitizePlayers() {
      if (Array.isArray(this.players) === false || this.players.length === 0) {
        throw new Error(_('ui_mp4frag.error.invalid_player_order'));
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
