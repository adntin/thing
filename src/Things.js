import { mqtt, TOPIC } from '@network';
import { NOOP } from '@helper';
import { PROTOCOL_VERSION } from './constants';
import Thing from './Thing';

class Things {
  constructor(userId, devices) {
    this._userId = userId;
    this.listeners = [];

    // 构造设备物模型实例
    this._instances = {}; // {deviceId: Thing}
    devices.forEach(device => {
      this._instances[device.id] = new Thing(userId, device);
    });

    this._mqttUserSubscribe(); // MQTT 订阅用户所有消息, 以`userId`维度, 订阅客户端消息(单播 + 广播)
    this._mqttUserOnline(); // MQTT 发布用户上线消息, 以`userId`维度, 发布客户端消息(广播)
    this._mqttMessageHandler(); // MQTT 监听处理所有消息, 以`userId`维度, 监听客户端消息(单播 + 广播) + 以`deviceId`维度, 监听设备端消息(广播)
  }

  _mqttUserSubscribe() {
    // `#`表示通配符
    // 解释: 客户端以`userId`维度订阅单播, 用于接收服务端或设备端的消息. 比如: 服务端(或设备端)单播, 只有客户端才能收到.
    const _TOPIC_SUBSCRIBE_UNICAST_ALL = `${TOPIC.CLIENT}/${this._userId}/#`;
    mqtt.subscribe({ topic: _TOPIC_SUBSCRIBE_UNICAST_ALL });
    // 解释: 客户端以`userId`维度订阅广播, 用于接收服务端或设备端的消息. 比如: 没有真实使用.
    const _TOPIC_SUBSCRIBE_BROADCAST_ALL = `${TOPIC.BROADCAST}/${this._userId}/#`;
    mqtt.subscribe({ topic: _TOPIC_SUBSCRIBE_BROADCAST_ALL });
  }

  _mqttUserOnline() {
    const service = 'user';
    const method = 'connect'; // 注意: `disconnect`用于 MQTT 遗言
    // 解释: 客户端以`userId`维度发布广播, 服务端和设备端都能收到消息. 比如: 用户的MQTT上线和离线.
    const topic = `${TOPIC.BROADCAST}/${this._userId}/${service}/${method}`;
    const message = {
      protocolVer: PROTOCOL_VERSION,
      service,
      method,
      // seq: getSequence(), // MQTT 底层会添加
      // srcAddr: `0.${this._userId}`, // MQTT 底层会添加
      tst: Date.now(),
      payload: {},
    };
    // 注意: `timeout: 0`很重要, 因为广播没有回复.
    mqtt.publish({ topic, message, timeout: 0 });
  }

  _mqttMessageHandler() {
    mqtt.setCallbacks({
      // eslint-disable-next-line no-unused-vars
      messageCallback: async (topic, message, packet) => {
        try {
          // console.log('mqtt:message', topic, message, packet);
          // 1. 所有设备监听回调
          this.listeners.forEach(listener => listener(message));
          // 2. 单设备监听回调
          const { payload } = message || NOOP.EMPTY_OBJECT;
          let deviceId = (payload || NOOP.EMPTY_OBJECT).devId; // 不一定存在
          if (!deviceId) {
            // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Regular_Expressions
            // const devId = 'iot/v1/cb/123/device/connect'.match(/^iot\/\w+\/\w+\/(\w+)\/.*/)[1];
            const arr = topic.match(/^iot\/\w+\/\w+\/(\w+)\/.*/);
            if (arr) {
              [, deviceId] = arr;
            }
          }
          if (!this._instances[deviceId]) {
            return; // 注意: 用户主题, 安防没有设备id
          }
          const thing = await this.get(deviceId);
          thing.listeners.forEach(listener => listener(message));
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('MQTT消息处理出错', error);
        }
      },
    });
  }

  set(device) {
    const thing = new Thing(this._userId, device);
    this._instances[device.id] = thing;
    return true;
  }

  async get(deviceId, timeout) {
    return new Promise(async (resolve, reject) => {
      let timer = 0;
      try {
        const thing = this._instances[deviceId];
        if (thing.loaded) {
          resolve(thing);
          return;
        }
        if (timeout > 0) {
          timer = setTimeout(reject, timeout, { code: 408, desc: '获取实例超时', data: timeout });
        }
        // 注意: 等待, 初始化未完成
        const t = await thing.init();
        resolve(t);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('获取实例失败', deviceId, this._instances);
        reject({ code: 400, desc: '获取实例失败', data: error });
      } finally {
        clearTimeout(timer);
      }
    });
  }

  async remove(deviceId) {
    try {
      const thing = this._instances[deviceId];
      if (thing) {
        const result = await thing.remove();
        delete this._instances[deviceId];
        return result;
      }
      return Promise.reject({ code: 400, desc: '设备不存在', data: deviceId });
    } catch (error) {
      return Promise.reject({ code: 400, desc: '删除设备失败', data: error });
    }
  }

  async batchRemove(deviceIds) {
    try {
      const promises = deviceIds.map(deviceId => this.remove(deviceId));
      const result = await Promise.all(promises);
      return result;
    } catch (error) {
      return Promise.reject({ code: 400, desc: '批量删除设备失败', data: error });
    }
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }
}

export default Things;
