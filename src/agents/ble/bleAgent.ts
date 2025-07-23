import { Agent } from '../base/agent';
import { Logger } from '../../utils/logger';
import { 
  BLEDeviceInfo, 
  BLEHeartRateData, 
  BLEMotionData, 
  BLEEnvironmentalData, 
  BLEBiometricData,
  BLERawDataPacket,
  BLESession
} from '../../models/whoop';
import { config } from '../../config';
import { promises as fs } from 'fs';
import path from 'path';

// BLE interface types (will be implemented with noble)
interface BLEPeripheral {
  id: string;
  advertisement: {
    localName?: string;
    serviceUuids?: string[];
    manufacturerData?: Buffer;
  };
  rssi: number;
  connect(callback?: (error?: string) => void): void;
  disconnect(callback?: (error?: string) => void): void;
  discoverServices(serviceUuids: string[], callback: (error?: string, services?: BLEService[]) => void): void;
  readHandle(handle: number, callback: (error?: string, data?: Buffer) => void): void;
  writeHandle(handle: number, data: Buffer, withoutResponse: boolean, callback?: (error?: string) => void): void;
}

interface BLEService {
  uuid: string;
  discoverCharacteristics(characteristicUuids: string[], callback: (error?: string, characteristics?: BLECharacteristic[]) => void): void;
}

interface BLECharacteristic {
  uuid: string;
  properties: string[];
  read(callback: (error?: string, data?: Buffer) => void): void;
  write(data: Buffer, withoutResponse: boolean, callback?: (error?: string) => void): void;
  subscribe(callback?: (error?: string) => void): void;
  unsubscribe(callback?: (error?: string) => void): void;
  on(event: 'data', listener: (data: Buffer, isNotification: boolean) => void): this;
  removeAllListeners(event?: string): this;
}

export class BLEAgent extends Agent {
  private noble: any = null;
  private connectedDevices = new Map<string, BLEPeripheral>();
  private activeCharacteristics = new Map<string, BLECharacteristic>();
  private currentSession: BLESession | null = null;
  private dataBuffer: BLERawDataPacket[] = [];
  private isScanning = false;
  private sessionStartTime: Date | null = null;

  // WHOOP 4.0 BLE characteristics (based on reverse engineering)
  private readonly WHOOP_CHARACTERISTICS = {
    MAIN_DATA: '61080002-8d6d-82b8-614a-1c8cb0f8dcc6',
    HEART_RATE: '61080003-8d6d-82b8-614a-1c8cb0f8dcc6',
    MOTION_DATA: '61080004-8d6d-82b8-614a-1c8cb0f8dcc6',
    ENVIRONMENTAL: '61080005-8d6d-82b8-614a-1c8cb0f8dcc6',
    BATTERY_LEVEL: '61080006-8d6d-82b8-614a-1c8cb0f8dcc6',
    DEVICE_INFO: '61080007-8d6d-82b8-614a-1c8cb0f8dcc6'
  };

  // Known WHOOP device patterns
  private readonly DEVICE_PATTERNS = [
    /^WHOOP/i,
    /^WHOOP-4\.0/i,
    /^WHOOP_[A-F0-9]{6}/i
  ];

  constructor() {
    super('BLE', new Logger('BLE'));
    this.initializeBLE();
  }

  /**
   * Initialize BLE stack
   */
  private async initializeBLE(): Promise<void> {
    try {
      // Try to import noble - this might fail if not installed
      const { default: noble } = await import('@abandonware/noble');
      this.noble = noble;

      this.noble.on('stateChange', this.onStateChange.bind(this));
      this.noble.on('discover', this.onDeviceDiscovered.bind(this));

      this.logger.success('✅ BLE stack initialized successfully');
    } catch (error) {
      this.logger.warn('⚠️ BLE stack not available:', error);
      this.noble = null;
    }
  }

  /**
   * Check if BLE is supported and ready
   */
  isSupported(): boolean {
    return this.noble !== null;
  }

  /**
   * Get BLE adapter state
   */
  getState(): string {
    if (!this.noble) return 'unsupported';
    return this.noble.state || 'unknown';
  }

  /**
   * Handle BLE state changes
   */
  private onStateChange(state: string): void {
    this.logger.info(`📡 BLE state changed: ${state}`);
    
    switch (state) {
      case 'poweredOn':
        this.logger.success('✅ BLE adapter is ready');
        break;
      case 'poweredOff':
        this.logger.warn('⚠️ BLE adapter is powered off');
        this.stopScanning();
        break;
      case 'unsupported':
        this.logger.error('❌ BLE is not supported on this system');
        break;
      case 'unauthorized':
        this.logger.error('❌ BLE access is unauthorized');
        break;
      case 'unknown':
        this.logger.warn('⚠️ BLE adapter state is unknown');
        break;
    }
  }

  /**
   * Start scanning for WHOOP devices
   */
  async startScanning(timeout: number = 30000): Promise<BLEDeviceInfo[]> {
    if (!this.noble) {
      throw new Error('BLE not supported');
    }

    if (this.noble.state !== 'poweredOn') {
      throw new Error(`BLE adapter not ready (state: ${this.noble.state})`);
    }

    this.logger.info('🔍 Starting scan for WHOOP devices...');
    this.isScanning = true;

    const discoveredDevices: BLEDeviceInfo[] = [];
    
    return new Promise((resolve, reject) => {
      // Set timeout
      const scanTimeout = setTimeout(() => {
        this.stopScanning();
        resolve(discoveredDevices);
      }, timeout);

      // Start scanning for any devices (we'll filter in onDeviceDiscovered)
      this.noble.startScanning([], false, (error: any) => {
        if (error) {
          clearTimeout(scanTimeout);
          this.isScanning = false;
          reject(new Error(`Failed to start scanning: ${error.message}`));
        }
      });

      // Override the discovery handler temporarily
      const originalHandler = this.onDeviceDiscovered.bind(this);
      this.noble.removeAllListeners('discover');
      this.noble.on('discover', (peripheral: BLEPeripheral) => {
        const deviceInfo = this.createDeviceInfo(peripheral);
        if (deviceInfo && this.isWhoopDevice(deviceInfo)) {
          this.logger.info(`🔍 Found WHOOP device: ${deviceInfo.name} (${deviceInfo.id})`);
          discoveredDevices.push(deviceInfo);
        }
        originalHandler(peripheral);
      });
    });
  }

  /**
   * Stop scanning for devices
   */
  stopScanning(): void {
    if (this.noble && this.isScanning) {
      this.noble.stopScanning();
      this.isScanning = false;
      this.logger.info('⏹️ Stopped scanning for devices');
    }
  }

  /**
   * Handle device discovery
   */
  private onDeviceDiscovered(peripheral: BLEPeripheral): void {
    const deviceInfo = this.createDeviceInfo(peripheral);
    if (deviceInfo && this.isWhoopDevice(deviceInfo)) {
      this.logger.info(`📱 Discovered WHOOP device: ${deviceInfo.name}`);
    }
  }

  /**
   * Create device info from peripheral
   */
  private createDeviceInfo(peripheral: BLEPeripheral): BLEDeviceInfo | null {
    const name = peripheral.advertisement.localName || 'Unknown Device';
    
    return {
      id: peripheral.id,
      name,
      rssi: peripheral.rssi,
      connected: false
    };
  }

  /**
   * Check if device is a WHOOP device
   */
  private isWhoopDevice(device: BLEDeviceInfo): boolean {
    return this.DEVICE_PATTERNS.some(pattern => pattern.test(device.name));
  }

  /**
   * Connect to a WHOOP device
   */
  async connectToDevice(deviceId: string): Promise<BLEDeviceInfo> {
    if (!this.noble) {
      throw new Error('BLE not supported');
    }

    this.logger.info(`🔗 Connecting to device: ${deviceId}`);

    return new Promise((resolve, reject) => {
      // Find the peripheral
      let targetPeripheral: BLEPeripheral | null = null;

      const onDiscover = (peripheral: BLEPeripheral) => {
        if (peripheral.id === deviceId) {
          targetPeripheral = peripheral;
          this.noble.stopScanning();

          peripheral.connect((error?: string) => {
            if (error) {
              reject(new Error(`Failed to connect: ${error}`));
              return;
            }

            const deviceInfo = this.createDeviceInfo(peripheral);
            if (deviceInfo) {
              deviceInfo.connected = true;
              this.connectedDevices.set(deviceId, peripheral);
              this.logger.success(`✅ Connected to ${deviceInfo.name}`);
              resolve(deviceInfo);
            } else {
              reject(new Error('Failed to create device info'));
            }
          });
        }
      };

      // Start scanning if not already scanning
      if (!this.isScanning) {
        this.noble.on('discover', onDiscover);
        this.noble.startScanning([], false);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (!targetPeripheral) {
            this.noble.stopScanning();
            this.noble.removeListener('discover', onDiscover);
            reject(new Error('Device not found or connection timeout'));
          }
        }, 30000);
      }
    });
  }

  /**
   * Discover and subscribe to WHOOP characteristics
   */
  async subscribeToCharacteristics(deviceId: string): Promise<void> {
    const peripheral = this.connectedDevices.get(deviceId);
    if (!peripheral) {
      throw new Error('Device not connected');
    }

    this.logger.info('🔧 Discovering services and characteristics...');

    return new Promise((resolve, reject) => {
      peripheral.discoverServices([], (error, services) => {
        if (error) {
          reject(new Error(`Service discovery failed: ${error}`));
          return;
        }

        if (!services || services.length === 0) {
          reject(new Error('No services found'));
          return;
        }

        // Find characteristics across all services
        let characteristicsFound = 0;
        const totalServices = services.length;

        services.forEach(service => {
          service.discoverCharacteristics([], (error, characteristics) => {
            characteristicsFound++;

            if (error) {
              this.logger.warn(`Failed to discover characteristics for service ${service.uuid}: ${error}`);
            } else if (characteristics) {
              characteristics.forEach(char => {
                if (Object.values(this.WHOOP_CHARACTERISTICS).includes(char.uuid)) {
                  this.subscribeToCharacteristic(deviceId, char);
                }
              });
            }

            // All services processed
            if (characteristicsFound === totalServices) {
              this.logger.success('✅ Subscribed to WHOOP characteristics');
              resolve();
            }
          });
        });
      });
    });
  }

  /**
   * Subscribe to a specific characteristic
   */
  private subscribeToCharacteristic(deviceId: string, characteristic: BLECharacteristic): void {
    const charKey = `${deviceId}:${characteristic.uuid}`;
    this.activeCharacteristics.set(charKey, characteristic);

    if (characteristic.properties.includes('notify') || characteristic.properties.includes('indicate')) {
      characteristic.subscribe((error) => {
        if (error) {
          this.logger.warn(`Failed to subscribe to ${characteristic.uuid}: ${error}`);
        } else {
          this.logger.info(`📡 Subscribed to characteristic: ${characteristic.uuid}`);
        }
      });

      characteristic.on('data', (data: Buffer, isNotification: boolean) => {
        this.handleCharacteristicData(characteristic.uuid, data);
      });
    }
  }

  /**
   * Handle incoming characteristic data
   */
  private handleCharacteristicData(characteristicUuid: string, data: Buffer): void {
    const timestamp = Date.now();
    
    const packet: BLERawDataPacket = {
      characteristic_uuid: characteristicUuid,
      timestamp,
      raw_data: new Uint8Array(data),
      data_type: this.determineDataType(characteristicUuid)
    };

    // Parse the data based on characteristic
    try {
      packet.parsed_data = this.parseCharacteristicData(characteristicUuid, data);
      this.dataBuffer.push(packet);
      
      // Process the parsed data
      this.processDataPacket(packet);
    } catch (error) {
      this.logger.warn(`Failed to parse data from ${characteristicUuid}:`, error);
      packet.parsed_data = null;
      this.dataBuffer.push(packet);
    }
  }

  /**
   * Determine data type from characteristic UUID
   */
  private determineDataType(uuid: string): BLERawDataPacket['data_type'] {
    switch (uuid) {
      case this.WHOOP_CHARACTERISTICS.HEART_RATE:
        return 'heart_rate';
      case this.WHOOP_CHARACTERISTICS.MOTION_DATA:
        return 'motion';
      case this.WHOOP_CHARACTERISTICS.ENVIRONMENTAL:
        return 'environmental';
      case this.WHOOP_CHARACTERISTICS.MAIN_DATA:
        return 'biometric';
      default:
        return 'unknown';
    }
  }

  /**
   * Parse characteristic data (simplified implementation)
   */
  private parseCharacteristicData(uuid: string, data: Buffer): any {
    switch (uuid) {
      case this.WHOOP_CHARACTERISTICS.HEART_RATE:
        return this.parseHeartRateData(data);
      case this.WHOOP_CHARACTERISTICS.MOTION_DATA:
        return this.parseMotionData(data);
      case this.WHOOP_CHARACTERISTICS.ENVIRONMENTAL:
        return this.parseEnvironmentalData(data);
      default:
        return this.parseGenericData(data);
    }
  }

  /**
   * Parse heart rate data
   */
  private parseHeartRateData(data: Buffer): BLEHeartRateData {
    // Simplified parser - actual implementation would be more complex
    const heartRate = data.readUInt8(1); // Assuming HR is in second byte
    
    return {
      timestamp: Date.now(),
      heart_rate: heartRate,
      contact_detected: (data.readUInt8(0) & 0x02) !== 0,
      rr_intervals: data.length > 2 ? [data.readUInt16LE(2)] : undefined
    };
  }

  /**
   * Parse motion data (accelerometer/gyroscope)
   */
  private parseMotionData(data: Buffer): BLEMotionData {
    // Simplified parser - real implementation would handle sensor data properly
    return {
      timestamp: Date.now(),
      accelerometer: {
        x: data.readInt16LE(0) / 1000,
        y: data.readInt16LE(2) / 1000,
        z: data.readInt16LE(4) / 1000
      },
      gyroscope: data.length > 6 ? {
        x: data.readInt16LE(6) / 1000,
        y: data.readInt16LE(8) / 1000,
        z: data.readInt16LE(10) / 1000
      } : undefined
    };
  }

  /**
   * Parse environmental data
   */
  private parseEnvironmentalData(data: Buffer): BLEEnvironmentalData {
    return {
      timestamp: Date.now(),
      skin_temperature: data.length > 0 ? data.readUInt16LE(0) / 100 : undefined,
      ambient_temperature: data.length > 2 ? data.readUInt16LE(2) / 100 : undefined
    };
  }

  /**
   * Parse generic data
   */
  private parseGenericData(data: Buffer): any {
    return {
      raw_bytes: Array.from(data),
      length: data.length,
      hex: data.toString('hex')
    };
  }

  /**
   * Process parsed data packet
   */
  private processDataPacket(packet: BLERawDataPacket): void {
    if (!this.currentSession) return;

    switch (packet.data_type) {
      case 'heart_rate':
        this.currentSession.heart_rate_data.push(packet.parsed_data);
        break;
      case 'motion':
        this.currentSession.motion_data.push(packet.parsed_data);
        break;
      case 'environmental':
        this.currentSession.environmental_data.push(packet.parsed_data);
        break;
      case 'biometric':
        this.currentSession.biometric_data.push(packet.parsed_data);
        break;
    }

    this.currentSession.total_packets++;
    this.currentSession.raw_packets.push(packet);
  }

  /**
   * Start a new BLE data collection session
   */
  async startSession(deviceId: string): Promise<string> {
    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      throw new Error('Device not connected');
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSession = {
      session_id: sessionId,
      device_info: this.createDeviceInfo(device)!,
      start_time: new Date().toISOString(),
      heart_rate_data: [],
      motion_data: [],
      environmental_data: [],
      biometric_data: [],
      raw_packets: [],
      total_packets: 0,
      data_quality_score: 0
    };

    this.sessionStartTime = new Date();
    this.dataBuffer = [];

    this.logger.success(`📊 Started BLE session: ${sessionId}`);
    return sessionId;
  }

  /**
   * Stop current BLE session
   */
  async stopSession(): Promise<BLESession | null> {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.end_time = new Date().toISOString();
    this.currentSession.data_quality_score = this.calculateDataQuality();

    const session = { ...this.currentSession };
    
    // Save session to file
    await this.saveSession(session);

    this.logger.success(`✅ Stopped BLE session: ${session.session_id}`);
    this.logger.info(`📊 Session stats: ${session.total_packets} packets, ${session.heart_rate_data.length} HR samples`);

    this.currentSession = null;
    this.sessionStartTime = null;

    return session;
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQuality(): number {
    if (!this.currentSession || !this.sessionStartTime) return 0;

    const sessionDuration = Date.now() - this.sessionStartTime.getTime();
    const expectedPackets = sessionDuration / 1000; // Rough estimate
    const actualPackets = this.currentSession.total_packets;
    
    const packetRatio = Math.min(actualPackets / expectedPackets, 1);
    const heartRateRatio = this.currentSession.heart_rate_data.length / expectedPackets;
    
    return Math.round((packetRatio * 0.6 + heartRateRatio * 0.4) * 100);
  }

  /**
   * Save session to file
   */
  private async saveSession(session: BLESession): Promise<void> {
    const filename = `ble_session_${session.session_id}.json`;
    const filepath = path.join(config.dataDir, 'ble_sessions', filename);
    
    try {
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await fs.writeFile(filepath, JSON.stringify(session, null, 2));
      this.logger.info(`💾 Saved session to ${filepath}`);
    } catch (error) {
      this.logger.error('Failed to save session:', error);
    }
  }

  /**
   * Disconnect from device
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    const peripheral = this.connectedDevices.get(deviceId);
    if (!peripheral) {
      throw new Error('Device not connected');
    }

    // Unsubscribe from characteristics
    for (const [key, characteristic] of this.activeCharacteristics) {
      if (key.startsWith(deviceId)) {
        characteristic.unsubscribe();
        characteristic.removeAllListeners();
        this.activeCharacteristics.delete(key);
      }
    }

    return new Promise((resolve, reject) => {
      peripheral.disconnect((error) => {
        if (error) {
          reject(new Error(`Failed to disconnect: ${error}`));
        } else {
          this.connectedDevices.delete(deviceId);
          this.logger.success(`✅ Disconnected from device: ${deviceId}`);
          resolve();
        }
      });
    });
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): BLEDeviceInfo[] {
    return Array.from(this.connectedDevices.entries()).map(([id, peripheral]) => {
      const info = this.createDeviceInfo(peripheral);
      if (info) {
        info.connected = true;
      }
      return info!;
    });
  }

  /**
   * Get current session info
   */
  getCurrentSession(): BLESession | null {
    return this.currentSession;
  }

  /**
   * List saved sessions
   */
  async listSessions(): Promise<string[]> {
    const sessionsDir = path.join(config.dataDir, 'ble_sessions');
    try {
      const files = await fs.readdir(sessionsDir);
      return files.filter(file => file.endsWith('.json'));
    } catch {
      return [];
    }
  }

  /**
   * Load saved session
   */
  async loadSession(sessionId: string): Promise<BLESession | null> {
    const filename = `ble_session_${sessionId}.json`;
    const filepath = path.join(config.dataDir, 'ble_sessions', filename);
    
    try {
      const data = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(data) as BLESession;
    } catch {
      return null;
    }
  }

  /**
   * Send command to device (if supported)
   */
  async sendCommand(deviceId: string, command: Buffer): Promise<Buffer | null> {
    const peripheral = this.connectedDevices.get(deviceId);
    if (!peripheral) {
      throw new Error('Device not connected');
    }

    // This would send a command to the main data characteristic
    // Implementation depends on WHOOP's command protocol
    this.logger.info(`📤 Sending command to device: ${command.toString('hex')}`);
    
    // For now, return null as we don't have the full command protocol
    return null;
  }

  /**
   * Get BLE status
   */
  getStatus() {
    return {
      supported: this.isSupported(),
      state: this.getState(),
      scanning: this.isScanning,
      connected_devices: this.connectedDevices.size,
      active_session: this.currentSession?.session_id || null,
      characteristics_subscribed: this.activeCharacteristics.size
    };
  }
}