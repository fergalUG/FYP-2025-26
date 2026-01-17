import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowAlert: true,
		shouldPlaySound: true,
		shouldSetBadge: false,
		shouldShowBanner: true,
		shouldShowList: true,
	}),
});

const BACKGROUND_LOCATION_TASK = 'BACKGROUND-LOCATION-TASK';

const ACTIVE_SPEED_THRESHOLD = 4.16667; // 15 km/h in m/s
const PASSIVE_SPEED_THRESHOLD = 1.38889; // 5 km/h in m/s

type TrackingMode = 'PASSIVE' | 'ACTIVE';

let currentTrackingMode: TrackingMode = 'PASSIVE';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
	if (error) {
		console.error('Background location task error:', error);
		return;
	}
	if (data) {
		const { locations } = data as { locations: Array<{ coords: { speed: number } }> };
		if (!locations || locations.length === 0) { return; }

		const latestLocation = locations[locations.length - 1];
		const speed = latestLocation.coords.speed; // speed in m/s
		console.log(`[BackgroundService] Location received. Speed: ${speed} m/s. Current Tracking Mode: ${currentTrackingMode}`);

		if (speed != null && speed >= ACTIVE_SPEED_THRESHOLD && currentTrackingMode === 'PASSIVE') {
			console.log('[BackgroundService] speed > 15km/h; Switching to ACTIVE tracking mode.');
			// TODO: implement start tracking service
		} else if ((speed == null || speed < PASSIVE_SPEED_THRESHOLD) && currentTrackingMode === 'ACTIVE') {
			console.log('[BackgroundService] speed < 5km/h; Switching to PASSIVE tracking mode.');
			// TODO: implement stop tracking service
			// probably need to have a tmeout before switching to passive to ensure user is stationary
		}

		// TODO: implement position processing for scores and storage
	}
});

export const requestBackgroundLocationPermissions = async (): Promise<boolean> => {
	const { granted: foregroundGranted } = await Location.requestForegroundPermissionsAsync();
	if (!foregroundGranted) {
		return false;
	}
	const { granted: backgroundGranted } = await Location.requestBackgroundPermissionsAsync();
	return backgroundGranted;
};
