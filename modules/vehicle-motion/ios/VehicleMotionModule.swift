import CoreMotion
import ExpoModulesCore

public class VehicleMotionModule: Module {
    private let motionManager = CMMotionManager()
    private let calibration = CalibrationEngine()
    
    public func definition() -> ModuleDefinition {
        Name("VehicleMotion")
        
        Events("onMotionUpdate", "onCalibrationComplete", "onCalibrationStatus")
        
        Function("startTracking") {
            startTracking()
        }
        
        Function("stopTracking") {
            motionManager.stopDeviceMotionUpdates()
        }

        Function("isCalibrated") {
            return self.calibration.hasCalibration
        }

        Function("captureReference") {
            guard let data = motionManager.deviceMotion else { return }
            let g = data.gravity
            
            calibration.captureReferenceMatrix(gravity: vector3(x: g.x, y: g.y, z: g.z))
            
            sendEvent("onCalibrationStatus", [
                "status": "detecting",
                "message": "Reference Captured. Drive straight to test calibration."
            ])
        }

        Function("setFilterAlpha") { (value: Double) in
            calibration.signalProcessor.setFilterAlpha(value)
            
            print("VehicleMotion: Filter Alpha updated to \(value)")
        }
        
        Function("setFcMin") { (value: Double) in
            calibration.signalProcessor.setFcMin(value)
        }
        
        Function("setFcMax") { (value: Double) in
            calibration.signalProcessor.setFcMax(value)
        }
        
        Function("setGyroRef") { (value: Double) in
            calibration.signalProcessor.setGyroRef(value)
        }
        
        Function("getSensorDiagnostics") { () -> [String: Any] in
            return self.calibration.getSensorDiagnostics().toDictionary()
        }
    }
    
    private func startTracking() {
        calibration.resetForTracking()
        
        sendEvent("onCalibrationStatus", [
            "status": "detecting",
            "message": "Detecting movement... Drive straight to calibrate",
        ])
        
        if motionManager.isDeviceMotionAvailable {
            motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
            
            motionManager.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
                guard let data = data, let self = self else { return }
                
                let accel = data.userAcceleration
                let gravity = data.gravity
                let attitude = data.attitude
                let gyro = data.rotationRate
                
                let rawAccel = vector3(x: accel.x, y: accel.y, z: accel.z)
                let rawGravity = vector3(x: gravity.x, y: gravity.y, z: gravity.z)
                let rawGyro = vector3(x: gyro.x, y: gyro.y, z: gyro.z)
                
                if self.calibration.isCalibrating {
                    self.calibration.handleAutoCalibration(
                        accel: rawAccel,
                        gravity: rawGravity,
                        attitude: attitude,
                        gyro: rawGyro,
                        onStatus: { status, message, progress in
                            self.sendEvent("onCalibrationStatus", [
                                "status": status,
                                "message": message,
                                "progress": progress as Any
                            ])
                        },
                        onComplete: { payload in
                            var finalPayload = payload
                            if let errors = self.calibration.getCalibrationError() {
                                finalPayload["errors"] = errors
                            }
                            self.sendEvent("onCalibrationComplete", finalPayload)
                        }
                    )
                }

                let filteredAccel = self.calibration.signalProcessor.update(accel: rawAccel, gravity: rawGravity, gyro: rawGyro)
                
                let transformedAccel = self.calibration.applyRotation(
                    x: filteredAccel.x,
                    y: filteredAccel.y,
                    z: filteredAccel.z
                )
                
                self.sendEvent("onMotionUpdate", [
                    "x": transformedAccel.x,
                    "y": transformedAccel.y,
                    "z": transformedAccel.z,

                    "rawX": accel.x,
                    "rawY": accel.y,
                    "rawZ": accel.z,

                    "filteredX": filteredAccel.x,
                    "filteredY": filteredAccel.y,
                    "filteredZ": filteredAccel.z,

                    "isCalibrated": self.calibration.hasCalibration,
                    "hasReference": self.calibration.referenceMatrix != nil
                ])
            }
        }
    }
}
