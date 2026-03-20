type ZoomTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type ZoomRecording = {
  id: string;
  topic: string;
  start_time: string;
  recording_files: {
    id: string;
    file_type: string;
    download_url: string;
    status: string;
  }[];
};

type ZoomRecordingsResponse = {
  meetings: ZoomRecording[];
};

export async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Missing Zoom credentials");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: accountId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} ${text}`);
  }

  const data: ZoomTokenResponse = await response.json();
  return data.access_token;
}

export async function getTodayRecordings(
  accessToken: string,
  date?: string
): Promise<ZoomRecording[]> {
  const targetDate = date || new Date().toISOString().split("T")[0];

  const response = await fetch(
    `https://api.zoom.us/v2/users/me/recordings?from=${targetDate}&to=${targetDate}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoom recordings fetch failed: ${response.status} ${text}`);
  }

  const data: ZoomRecordingsResponse = await response.json();

  // Filter for "THO Daily Stand-Up" meetings (case-insensitive partial match)
  return data.meetings.filter((m) =>
    m.topic.toLowerCase().includes("tho daily stand-up")
  );
}

export async function downloadTranscript(
  downloadUrl: string,
  accessToken: string
): Promise<string> {
  const url = `${downloadUrl}?access_token=${accessToken}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Transcript download failed: ${response.status}`
    );
  }

  return response.text();
}
