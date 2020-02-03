import {checkCircleCiContext, getPullRequest, getBuildNumber} from './util'

const Octokit = require("@octokit/rest");
const client = new Octokit();
const {CircleCI} = require("circleci-api");
const CIRCLECI_TOKEN = "ce9245a887f397ecb8c2f55b849bf29261b7b23ee";

client.authenticate({
  type: 'token',
  token: '28e78b4154a7c13cecfa35eaaba127ee8c5a1e37'
});

const eventPayload = (payload) => {
  const sha = payload['body']['sha'];
  const repo = payload['body']['repository']['name'];
  const login = payload['body']['repository']['owner']['login'];
  const number = payload['body']['number'];

  handleStatus(payload)
};

const handlePullRequest = (payload) => {
  const repo = payload['body']['repository']['name'];
  const number = payload['body']['number'];
  const action = payload['body']['action'];

  if (action !== 'closed') {
  //  TODO: return a response object
  }
  const data = deleteHerokuApp(number)
  data.then(() => {
    postComment(repo, number, `Review APP https://hge-ci-pull-${number}.herokuapp.com is deleted`)
  })
};

const handleIssueComment = (payload) => {
  const repo = payload['body']['repository']['name'];
  const number = payload['body']['comment']['id'];
  const issue_number = payload['body']['issue']['number'];
  const action = payload['body']['action'];
  const user = payload['body']['comment']['user']['login'];

  if (action !== 'created') {
    console.log(`Github comment ${number}, Ignoring: ${action} event`)
  //  TODO: return a response object
  }

  if (!checkPullRequest(payload)) {
    console.log(`Github comment ${number}, Ignoring: Not a Pull Request`)
    // TODO: return a response object
  }

  const comment = payload['body']['comment']['body'].trim().split(" ");
  if (comment.length !== 2) {
    console.log(`Not a valid comment ${comment}`)
    //  TODO: return a response object
  }

  if (comment[0] !== '/heroku') {
    console.log(`Not a valid comment ${comment}`)
    //  TODO: return a response object
  }

  if (comment[1] !== 'deploy' || comment[1] !== 'delete') {
    console.log(`Not a valid comment ${comment}`);
    postComment(repo, issue_number, `@${user} not a valid heroku command (deploy, delete)`)
  //  TODO: return a response object
  }

  const orgs = getOrgs(user);
  if (Object.entries(orgs).length !== 0 || orgs['login'] !== 'hasura') {
  postComment(repo, issue_number, `@${user} you don't have enough permissions to execute this command`)
  //  TODO: return a response object
  }

  if (comment[1] === 'deploy') {
    const commits = getCommits(user, repo, issue_number);
    if (Object.entries(commits).length === 0) {
      console.log(`there are no commits in the pull request ${issue_number}`);
      postComment(repo, issue_number, `@${user} there are no commits in the PR`)
      //  TODO: return a response object
    }
    const commit = commits[0]['sha'];
    console.log(commit);
    const statuses = getStatus(repo, commit);
    if (Object.entries(statuses).length === 0) {
      console.log(`Invalid statuses ${statuses}`)
      //  TODO: return a response object
    }
    console.log(statuses);
//  Get workflow name using check_build_worthiness job
    const build_number = statuses['check_build_worthiness']['build_number'];
//  Get the current build info to find the workflow name.
    const current_build_info = getBuildInfo(user, repo, build_number);
    if (!current_build_info) {
      console.log('Cannot fetch build info')
      //  TODO: return a response object
    }
    let server_status_name = '';
    let console_status_name = '';
    const workflowName = current_build_info['workflows']['workflow_name'];
    if (workflowName === 'build_and_test') {
      server_status_name = 'build_server';
      console_status_name = 'test_and_build_console'
    } else if (workflowName === 'workflow_v20190516') {
      server_status_name = 'build_server';
      console_status_name = 'build_console'
    } else if (workflowName === 'workflow_v20200120') {
      server_status_name = 'build_image';
      console_status_name = 'build_console'
    } else {
      //  TODO: return a response object
    }

    if (!statuses.hasOwnProperty(server_status_name) && !statuses.hasOwnProperty(console_status_name)) {
      console.log('console and server checks missing');
      postComment(repo, issue_number, `@${user} status checks not passed for commit https://github.com/${repo}/pull/${issue_number}/commits/${commit}`)
      //  TODO: return a response object
    }

    const consoleBranch_json = getBuildInfo(user, repo, statuses[console_status_name]['build_number']);
    const consoleBranch = getPullRequest(consoleBranch_json['branch']);
    if (Object.entries(consoleBranch).length === 0) {
      postComment(repo, issue_number, `@${user} not able to deploy heroku app`)
      //  TODO: return a response object
    }

    const serverBranch_json = getBuildInfo(user, repo, statuses[server_status_name]['build_number']);
    const serverBranch = getPullRequest(serverBranch_json['branch']);
    if (Object.entries(serverBranch).length === 0 || serverBranch !== consoleBranch) {
      postComment(repo, issue_number, `@${user} not able to deploy heroku app`)
      //  TODO: return a response object
    }

//  Get artifacts list
    statuses[console_status_name]['artifacts'] = getArtifacts(user, repo, statuses[console_status_name]['build_number']);
    statuses[server_status_name]['artifacts'] = getArtifacts(user, repo, statuses[server_status_name]['build_number']);
  }
};

const checkPullRequest = (payload) => {
  if (!payload['body']['issue'].hasOwnProperty('pull_request')) {
    console.log(false)
  }
  console.log(true)
};

const postComment = (repo, number, body) => {
  client.issues.createComment({
    owner: 'ashishra0',
    repo: repo,
    number,
    body: body
  }).then((res) => {
    if (res.status !== 201) {
      console.log(`Failed to update comment for ${repo}, message: ${res['message']}`);
      return false
    }
    return true
  }).catch((err) => {
    console.log("error occurred: " + err)
  })
};

const getOrgs = (user) => {
  client.orgs.getMembership({
    org: 'hasura',
    username: user
  }).then((res) => {
    return res.data['organization']
  }).catch((err) => {
    console.log("Error occured: " + err)
  })
};

const getCommits = (login, repo, pull_number) => {
  client.pullRequests.listCommits({
    owner: login,
    repo,
    number: pull_number
  }).then((res) => {
    console.log(res.data)
  }).catch((err) => {
    console.log(err)
  })
};

const getStatus = (repo, sha) => {
  client.repos.getCombinedStatusForRef({
    owner: 'ashishra0',
    repo: repo,
    ref: sha
  }).then((response) => {
    if (response.status !== 200) {
      console.log("Erorr: " + response.status);
    }
    return getCombinedStatus(response.data.statuses.reverse());
  })
};

const handleStatus = (payload) => {
  const repo = payload['body']['repository']['name'];
  const sha = payload['body']['sha'];
  let status;
  let status_name;
  let state;
  status = client.repos.getCombinedStatusForRef({
    owner: 'ashishra0',
    repo: repo,
    ref: sha
  });
  status.then((res) => {
    res.data.statuses.forEach((elem) => {
      status_name = checkCircleCiContext(elem['context']);
      state = elem['state'];
      if (status_name === 'build_server' && state === 'success') {
      //  TODO: deploy review app
        console.log('herokuapp deployed')å
      }
    })
  })
};

const getCombinedStatus = (res) => {
  let obj = {};
  res.forEach((elem) => {
    let status_name = checkCircleCiContext(elem['context']);
    if (status_name === ""){
      return
    }
    let build_number = getBuildNumber(elem['target_url']);
    if (build_number === "") {
      return
    }
    if (elem['state'] !== "success") {
      return
    }
    if (!elem.hasOwnProperty('status_name')) {
      obj[status_name] = {
        'build_number': build_number
      }
    }
  });
  return obj
};

const getBuildInfo = (login, repo, build_number) => {
  const api = new CircleCI({
    token: CIRCLECI_TOKEN,
    vcs: {
      owner: login,
      repo: repo
    }
  });

  api.build(build_number)
  .then((data) => {
    console.log(data)
  }).catch((err) => {
    console.log("error: " + err)
  })
};

const getArtifacts = (login, repo, build_number) => {
  const api = new CircleCI({
    token: CIRCLECI_TOKEN,
    vcs: {
      owner: login,
      repo: repo
    }
  });

  api.artifacts(build_number)
    .then((data) => {
      console.log(data)
    }).catch((err) => {
      console.log("artifact error: " + err)
  })
};

const deleteHerokuApp = (pullNumber) => {
  const url =`https://api.heroku.com/review-apps/${pullNumber}`
  return fetch(url, {
    method: 'DELETE'
  }).then((res) => {
    console.log(res)
  }).catch((err) => {
    console.log(err)
  })
}

export default eventPayload;