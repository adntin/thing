import { NOOP } from '@helper';
import { http, mqtt, TOPIC } from '@network';
import { PROTOCOL_VERSION } from './constants';

class Thing {
  constructor(userId, device) {
    const { id, directId, schemaUrl, schemaData } = device;
    this._userId = userId; // 用户ID, 必须
    this._id = id; // 当前设备ID, 必须
    this._directId = directId; // 直连设备ID, 可选
    this._schemaUrl = schemaUrl; // 物模型下载地址, 二选一
    this._schemaData = schemaData; // 物模型数据结构, 二选一
    this.listeners = [];
    // 注意: 构造即初始化(提前准备)
    this.loading = false;
    this.loaded = false;
    this._magic = this.init();
  }

  async init() {
    try {
      if (this.loaded) {
        return this;
      }
      if (this.loading) {
        return this._magic; // 注意: 避免重复请求
      }
      this.loading = true;
      this.loaded = false;
      if (this._schemaUrl && !this._schemaData) {
        this._schemaData = await import(`./schemas/${this._schemaUrl}.json`);
        // this._schemaData = await http.request({
        //   url: `/things/${this._schemaUrl}`,
        //   method: 'get',
        // });
      }
      this._establishWANChannel();
      this._establishLANChannel();
      this.loading = false;
      this.loaded = true;
      delete this._magic; // 注意: 没有必要存在了
      return this;
    } catch (error) {
      this.loading = false;
      this.loaded = false;
      return Promise.reject({ code: 400, desc: '初始化失败', data: error });
    }
  }

  _getTopicSubscribeBroadcast() {
    // `#`表示通配符
    // 解释: 客户端以`deviceId`维度订阅广播, 用于接收服务端或设备端的消息. 比如: 设备端(或服务端)广播, 服务端(或设备端)和客户端都能收到.
    return `${TOPIC.BROADCAST}/${this._directId || this._id}/#`;
  }

  // 建立广域网通道
  _establishWANChannel() {
    // 客户端以`deviceId`维度添加 MQTT 订阅, 只考虑广播
    mqtt.subscribe({ topic: this._getTopicSubscribeBroadcast() });
  }

  // 建立局域网通道（TCP、UDP、BLE、BLEMesh）
  _establishLANChannel() {}

  // 取消广域网通道
  _closeWANChannel() {
    // 客户端以`deviceId`维度取消 MQTT 订阅, 只考虑广播
    mqtt.unsubscribe({ topic: this._getTopicSubscribeBroadcast() });
  }

  // 取消局域网通道（TCP、UDP、BLE、BLEMesh）
  _closeLANChannel() {}

  // 删除设备
  async remove(params = NOOP.EMPTY_OBJECT, _extends = NOOP.EMPTY_OBJECT, timeout) {
    let method = '';
    let payload = null;
    if (this._directId === this._id) {
      method = 'devUnbindReq'; // 直连设备
      const { resetFlag = 0 } = params;
      payload = {
        devId: this._id,
        resetFlag, // 注意: 0: 删除设备, 但不恢复出厂设置  1: 删除设备, 并恢复出厂设置
        unbindFlag: 1, // 云端写死 1
        extends: _extends,
      };
    } else {
      method = 'delSubDevReq'; // 子设备
      payload = {
        devId: this._id,
        extends: _extends,
      };
    }
    const topic = this._getTopicToServer(method);
    const message = this._getMessage(method, payload);
    const result = await this._send({ topic, message, timeout });
    if (result?.ack?.code === 200) {
      this._closeWANChannel();
      this._closeLANChannel();
      return result;
    }
    return Promise.reject(result);
  }

  // 从局域网通道发送数据
  _sendLANChannel() {
    // eslint-disable-next-line no-unused-vars
    return new Promise((resolve, reject) => {});
  }

  // 从广域网通道发送数据
  _sendWANChannel(params) {
    return mqtt.publish(params);
  }

  // 发送数据
  _send(params) {
    const promiseWAN = this._sendWANChannel(params);
    const promiseLAN = this._sendLANChannel(params);
    // 兼容性: https://caniuse.com/?search=promise.any
    return Promise.any([promiseWAN, promiseLAN]);
  }

  _setLocalData() {}

  _getLocalData() {}

  _removeLocalData() {}

  async getSchema() {
    if (!this.loaded) {
      await this.init();
    }
    return this._schemaData;
  }

  async getProperty(props = NOOP.EMPTY_OBJECT, _extends = NOOP.EMPTY_OBJECT, timeout) {
    const method = 'getDevPropsReq';
    const payload = {
      devId: this._id,
      props,
      extends: _extends,
    };
    const topic = this._getTopicToDevice(method);
    const message = this._getMessage(method, payload);
    return this._send({ topic, message, timeout });
  }

  async setProperty(props = NOOP.EMPTY_OBJECT, _extends = NOOP.EMPTY_OBJECT, timeout) {
    const method = 'setDevPropsReq';
    const payload = {
      devId: this._id,
      props,
      extends: _extends,
    };
    const topic = this._getTopicToDevice(method);
    const message = this._getMessage(method, payload);
    return this._send({ topic, message, timeout });
  }

  async setAction(action, input, timeout) {
    const method = 'devActionReq';
    const payload = {
      devId: this._id,
      parentId: this._directId,
      action,
      in: input,
    };
    const topic = this._getTopicToServer(method);
    const message = this._getMessage(method, payload);
    return this._send({ topic, message, timeout });
  }

  _getTopicToDevice(method) {
    // 解释: 客户端以`deviceId`维度发布单播, 只有设备端才能收到消息.
    return `${TOPIC.CLIENT}/${this._directId || this._id}/device/${method}`;
  }

  _getTopicToServer(method) {
    // 解释: 客户端以`userId`维度发布单播, 只有服务端才能收到消息.
    return `${TOPIC.SERVER}/${this._userId}/device/${method}`;
  }

  _getMessage(method, payload) {
    return {
      protocolVer: PROTOCOL_VERSION,
      service: 'device',
      method,
      // seq: getSequence(), // MQTT 底层会添加
      // srcAddr: `0.${this._userId}`, // MQTT 底层会添加
      tst: Date.now(),
      payload,
    };
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter((listener) => listener !== callback);
  }
}

export default Thing;
