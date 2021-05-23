'use strict';

const dashboard = require('node-red-dashboard');

const initController = require('./lib/initController.js');

module.exports = RED => {
  const {
    settings,
    _,
    nodes: { createNode, getNode, registerType },
  } = RED;

  const { addWidget } = dashboard(RED);

  const { uiMp4fragHlsJsUrl = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js' } = settings;

  class UiMp4fragNode {
    constructor(config) {
      createNode(this, config);

      try {
        this.group = config.group;

        this.order = config.order || 0;

        this.width = config.width;

        this.height = config.height;

        this.hlsJsConfig = UiMp4fragNode.jsonParse(config.hlsJsConfig);

        this.players = UiMp4fragNode.jsonParse(config.players);

        this.errorPoster = config.errorPoster;

        this.readyPoster = config.readyPoster;

        this.play = config.play;

        this.unload = config.unload;

        this.retry = config.retry;

        this.threshold = config.threshold;

        this.videoID = `${UiMp4fragNode.type}_video_${this.id}`;

        this.videoOptions = 'preload="metadata" muted playsinline'; // disablePictureInPicture'; // todo: user configurable

        UiMp4fragNode.validateGroup(this.group); // throws

        UiMp4fragNode.validateHlsJsConfig(this.hlsJsConfig); // throws

        UiMp4fragNode.validatePlayers(this.players); // throws

        this.addToHead(); // adds the script and style to the head (only once)

        this.addToBody(); // adds the html markup to the body

        this.on('close', this.onClose); // listen to the close event

        this.status({ fill: 'green', shape: 'ring', text: _('ui_mp4frag.info.ready') });
      } catch (err) {
        this.error(err);

        this.status({ fill: 'red', shape: 'dot', text: err.toString() });
      }
    }

    static validateGroup(group) {
      const node = getNode(group);

      const type = node && node.type;

      if (type !== 'ui_group') {
        throw new Error(_('ui_mp4frag.error.invalid_ui_group'));
      }
    }

    addToHead() {
      ++UiMp4fragNode.nodeCount;

      if (UiMp4fragNode.nodeCount === 1 && typeof UiMp4fragNode.headDone === 'undefined') {
        UiMp4fragNode.headDone = addWidget({
          node: '',
          group: '',
          order: 0,
          width: 0,
          height: 0,
          format: UiMp4fragNode.renderInHead(),
          templateScope: 'global', // global causes `format` to be inserted in <head>
          emitOnlyNewValues: false,
          forwardInputMessages: false,
          storeFrontEndInputAsState: false,
        });
      }
    }

    removeFromHead() {
      --UiMp4fragNode.nodeCount;

      if (UiMp4fragNode.nodeCount === 0 && typeof UiMp4fragNode.headDone === 'function') {
        UiMp4fragNode.headDone();

        UiMp4fragNode.headDone = undefined;
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

      this.removeFromHead();

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
  .ui-mp4frag-container {
    width: 100%;
    height: 100%;
  }
  .ui-mp4frag-video {
    width: 100%;
    height: 100%;
    object-fit: fill;
  }
  .ui-mp4frag-controls {
   /* todo */
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

      return String.raw`
<div class="ui-mp4frag-container" ng-init='init(${initObjStr})'>
  <video id="${this.videoID}" class="ui-mp4frag-video" poster="${this.readyPoster}" ${this.videoOptions}></video>
</div>`;
    }

    static validateHlsJsConfig(hlsJsConfig) {
      if (typeof hlsJsConfig !== 'object' || hlsJsConfig === null) {
        throw new Error(_('ui_mp4frag.error.invalid_hls_js_config'));
      }
    }

    static validatePlayers(players) {
      if (Array.isArray(players) === false || players.length === 0) {
        throw new Error(_('ui_mp4frag.error.invalid_player_order'));
      }
    }

    static jsonParse(str) {
      try {
        return JSON.parse(str);
      } catch (err) {
        return str;
      }
    }
  }

  UiMp4fragNode.nodeCount = 0; // increment in (successful) constructor, decrement on close event

  UiMp4fragNode.type = 'ui_mp4frag';

  UiMp4fragNode.headDone = undefined;

  const UiMp4fragSettings = {
    settings: {
      uiMp4fragHlsJsUrl: { value: uiMp4fragHlsJsUrl, exportable: true },
    },
  };

  registerType(UiMp4fragNode.type, UiMp4fragNode, UiMp4fragSettings);
};
