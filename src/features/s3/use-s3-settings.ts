import { useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useS3Store } from '@/stores/s3';

export function useS3Settings() {
  const s3 = useS3Store();
  const [endpoint, setEndpoint] = useState(s3.connection?.endpoint ?? '');
  const [region, setRegion] = useState(s3.connection?.region ?? 'us-east-1');
  const [bucket, setBucket] = useState(s3.connection?.bucket ?? '');
  const [prefix, setPrefix] = useState(s3.connection?.prefix ?? '');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [pathStyle, setPathStyle] = useState(s3.connection?.pathStyle ?? true);
  const [allowHttp, setAllowHttp] = useState(s3.connection?.allowHttp ?? false);
  const disabled = s3.busy || s3.loading || !s3.ready || Platform.OS === 'web';
  async function connect() {
    if (disabled) {
      return;
    }
    Keyboard.dismiss();
    await s3.connect({
      endpoint,
      region,
      bucket,
      prefix,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      pathStyle,
      allowHttp,
    });
    setSecretAccessKey('');
    setSessionToken('');
  }
  return {
    s3,
    endpoint,
    setEndpoint,
    region,
    setRegion,
    bucket,
    setBucket,
    prefix,
    setPrefix,
    accessKeyId,
    setAccessKeyId,
    secretAccessKey,
    setSecretAccessKey,
    sessionToken,
    setSessionToken,
    pathStyle,
    setPathStyle,
    allowHttp,
    setAllowHttp,
    disabled,
    connect,
  };
}
