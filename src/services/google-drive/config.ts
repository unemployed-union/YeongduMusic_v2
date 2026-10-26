// Public OAuth identifiers. Client secrets must never be included in a mobile app.
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '513932420837-8oov6cq1j16gu3akdcigglm2d0n7r9j7.apps.googleusercontent.com';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
