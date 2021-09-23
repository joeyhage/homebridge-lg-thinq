import {AirPurifier} from '../v1/devices';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {AirPurifierStatus} from '../devices/AirPurifier';
import {LGThinQHomebridgePlatform} from '../platform';

enum RotateSpeed {
  LOW = 2,
  MEDIUM = 4,
  HIGH = 6,
}

export default class AIR_910604_WW extends AirPurifier {
  protected serviceTurboMode;

  public static model() {
    return 'AIR_910604_WW';
  }

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const device: Device = this.accessory.context.device;
    const {
      Service: {
        Switch,
      },
      Characteristic,
    } = this.platform;

    // this model do not support light control
    if (this.serviceLight) {
      accessory.removeService(this.serviceLight);
      this.serviceLight = null;
    }

    this.serviceAirPurifier.removeCharacteristic(Characteristic.SwingMode);
    this.serviceAirPurifier.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        maxValue: Object.keys(RotateSpeed).length / 2,
      });

    this.serviceTurboMode = accessory.getService(Switch) || accessory.addService(Switch, 'Turbo Mode');
    this.serviceTurboMode.updateCharacteristic(platform.Characteristic.Name, 'Turbo Mode');
    this.serviceTurboMode.getCharacteristic(platform.Characteristic.On)
      .onSet((value: CharacteristicValue) => {
        if (this.Status.isPowerOn) {
          this.platform.ThinQ.thinq1DeviceControl(device, 'AirFast', value ? '1' : '0').then(() => {
            device.data.snapshot.raw['AirFast'] = value ? 1 : 0;
            this.updateAccessoryCharacteristic(device);
          });
        }
      });
  }

  public updateAccessoryCharacteristic(device: Device) {
    const {
      Characteristic,
      Characteristic: {
        TargetAirPurifierState,
      },
    } = this.platform;

    this.serviceAirPurifier.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceAirPurifier.updateCharacteristic(Characteristic.CurrentAirPurifierState, this.Status.isPowerOn ? 2 : 0);
    this.serviceAirPurifier.updateCharacteristic(TargetAirPurifierState,
      this.Status.isNormalMode ? TargetAirPurifierState.MANUAL : TargetAirPurifierState.AUTO);
    this.serviceAirPurifier.updateCharacteristic(Characteristic.RotationSpeed, this.Status.rotationSpeed);

    this.serviceAirQuality.updateCharacteristic(Characteristic.PM2_5Density, this.Status.airQuality.PM2);
    this.serviceAirQuality.updateCharacteristic(Characteristic.PM10Density, this.Status.airQuality.PM10);
    this.serviceAirQuality.updateCharacteristic(Characteristic.StatusActive, this.Status.airQuality.isOn);
    this.serviceAirQuality.updateCharacteristic(Characteristic.AirQuality, this.Status.airQuality.overall);

    this.serviceTurboMode.updateCharacteristic(Characteristic.On, this.Status.isTurboOn ? 1 : 0);
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (this.Status.isTurboOn || !this.Status.isPowerOn || (!!value !== this.Status.isNormalMode)) {
      return; // just skip it
    }

    await this.platform.ThinQ.thinq1DeviceControl(device, 'WindStrength', value ? '8' : RotateSpeed.HIGH);
  }

  public get Status() {
    return new Status(this.accessory.context.device.snapshot);
  }
}

class Status extends AirPurifierStatus {
  public get isTurboOn() {
    return !!parseInt(this.data.raw['AirFast']);
  }

  public get isNormalMode() {
    return this.data['airState.windStrength'] !== 8;
  }

  public get rotationSpeed() {
    const index = Object.keys(RotateSpeed).indexOf(parseInt(this.data['airState.windStrength']).toString());
    return index !== -1 ? index + 1 : Object.keys(RotateSpeed).length / 2;
  }
}
