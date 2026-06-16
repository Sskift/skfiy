export const SKFIY_APP_PROCESS_PATTERN = "/skfiy\\.app/Contents/(MacOS|Frameworks)/";

const SKFIY_APP_PROCESS_REGEX = new RegExp(SKFIY_APP_PROCESS_PATTERN);

export function isSkfiyAppProcessLine(line) {
  return SKFIY_APP_PROCESS_REGEX.test(String(line));
}

export function filterSkfiyAppProcessLines(lines) {
  return lines.filter((line) => isSkfiyAppProcessLine(line));
}
