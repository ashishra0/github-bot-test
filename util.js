export const checkCircleCiContext = (context) => {
  let pattern = /ci\/circleci:\s(.*)/;
  let str = context.match(pattern);
  if (!str) {
    return
  }
  return str[1]
};

export const getBuildNumber = (url) => {
  let pattern = /https?:\/\/.+?\/.+?\/.+?\/.+?\/(\d+)/;
  let str = url.match(pattern);
  if (!str) {
    return
  }
  return str[1]
};

export const getPullRequest = (branch) => {
  let pattern = /https?:\/\/.+?\/.+?\/.+?\/.+?\/(\d+)/;
  let str = branch.match(pattern);
  if (!str) {
    return
  }
  return str[1]
};