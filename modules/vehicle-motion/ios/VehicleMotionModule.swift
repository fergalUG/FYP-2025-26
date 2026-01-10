import CoreMotion
import ExpoModulesCore

public class VehicleMotionModule: Module {
    private let motionManager = CMMotionManager()
    private let calibration = CalibrationEngine()

    private let uiSignalProcessor = SignalProcessor(alpha: 0.15)
    
    public func definition() -> ModuleDefinition {
        Name("VehicleMotion")
        
        Events("onMotionUpdate", "onCalibrationComplete", "onCalibrationStatus")
        
        Function("startTracking") {
            startTracking()
        }
        
        Function("stopTracking") {
            motionManager.stopDeviceMotionUpdates()
            uiSignalProcessor.reset()
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
                
                if self.calibration.isCalibrating {
                    self.calibration.handleAutoCalibration(
                        accel: accel,
                        gravity: gravity,
                        attitude: attitude,
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

                let rawAccel = vector3(x: accel.x, y: accel.y, z: accel.z)
                let filteredAccel = self.uiSignalProcessor.update(current: rawAccel)
                
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
