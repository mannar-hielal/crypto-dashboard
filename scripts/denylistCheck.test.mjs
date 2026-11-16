/** scripts/denylist-check.sh: the local benchmark-name check (`node --test scripts/`, pnpm test:scripts). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./denylist-check.sh', import.meta.url));

/**
 * The environment without git's own variables. Inside a hook (pre-commit runs these tests), git
 * exports GIT_INDEX_FILE, GIT_DIR, GIT_WORK_TREE…; a throwaway repo's `git add` or `git commit`
 * would then write into the real repository's index or branch. The developer's global and system
 * git config are left out too, so a global commentChar or commit signing can't change a result.
 */
function cleanEnv(extra = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
  return {
    ...env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    ...extra,
  };
}

/** Runs `msg` mode on a message with a given list (a made-up term: the real list stays local) */
function checkMessage(message, list) {
  const dir = mkdtempSync(join(tmpdir(), 'denylist-'));
  try {
    const msgFile = join(dir, 'msg.txt');
    writeFileSync(msgFile, message);
    const env = cleanEnv();
    if (list !== undefined) {
      env.DENYLIST_FILE = join(dir, 'list.txt');
      writeFileSync(env.DENYLIST_FILE, list);
    } else {
      env.DENYLIST_FILE = join(dir, 'missing.txt');
    }
    return spawnSync('sh', [SCRIPT, 'msg', msgFile], { cwd: dir, env, encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('blocks a message naming a listed term, in any case', () => {
  assert.equal(checkMessage('feat: match ACMECOURSE lesson 4\n', 'acmecourse\n').status, 1);
});

test('passes a message that names no listed term', () => {
  assert.equal(checkMessage('feat: match the benchmark course\n', 'acmecourse\n').status, 0);
});

test('reads a list saved with Windows line endings, spaces and comments', () => {
  const list = '# the benchmark names\r\n  acmecourse  \r\n\r\n';
  assert.equal(checkMessage('feat: acmecourse\n', list).status, 1);
});

test('ignores comment lines when the git editor template is there (git strips them)', () => {
  const message =
    'feat: tidy\n# Please enter the commit message for your changes.\n# acmecourse.md\n';
  assert.equal(checkMessage(message, 'acmecourse\n').status, 0);
});

test('msg skips the template form (`# …`, `#<tab>…`); pre-push reads the stored message', () => {
  assert.equal(checkMessage('feat: x\n\n# acmecourse in the template\n', 'acmecourse\n').status, 0);
});

test('ignores the staged diff that `git commit -v` adds below the scissors line', () => {
  const message =
    'feat: tidy\n# ------------------------ >8 ------------------------\n-acmecourse\n';
  assert.equal(checkMessage(message, 'acmecourse\n').status, 0);
});

test('still checks a message line with a # in the middle', () => {
  assert.equal(checkMessage('feat: issue #12 acmecourse\n', 'acmecourse\n').status, 1);
});

// git in a test repo: a fixed identity, and none of the caller's GIT_* variables (a hook's
// GIT_INDEX_FILE must never reach a test repository's commands)
const spawnGit = (cwd, ...args) =>
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    env: cleanEnv(),
    encoding: 'utf8',
  });
const runGit = (cwd, ...args) => {
  const r = spawnGit(cwd, ...args);
  assert.equal(r.status, 0, r.stderr);
};

/**
 * Runs the script in a throwaway repo: `setup` makes commits or stages changes with the given git
 * helper, and may return the script's arguments (default `staged`)
 */
function checkStaged(setup, listText = 'acmecourse\n') {
  const dir = mkdtempSync(join(tmpdir(), 'denylist-repo-'));
  try {
    const git = (...args) => runGit(dir, ...args);
    const gitTry = (...args) => spawnGit(dir, ...args).status;
    git('init', '-q');
    const write = (name, text) => writeFileSync(join(dir, name), text);
    const out = (dir) => (cmd) =>
      spawnSync('git', cmd, { cwd: dir, env: cleanEnv(), encoding: 'utf8' }).stdout.trim();
    const result = setup({ git, gitTry, write, rev: out(dir), dir }) ?? ['staged'];
    const { args, input } = Array.isArray(result) ? { args: result } : result;
    const list = join(dir, '.list');
    writeFileSync(list, listText);
    return spawnSync('sh', [SCRIPT, ...args], {
      cwd: dir,
      input,
      env: cleanEnv({ DENYLIST_FILE: list }),
      encoding: 'utf8',
    }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('staged: blocks an added line naming a term', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'see acmecourse\n');
    git('add', 'a.md');
  });
  assert.equal(status, 1);
});

test('staged: checks an added line that starts with "++"', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.js', '++acmecourse;\n');
    git('add', 'a.js');
  });
  assert.equal(status, 1);
});

test('staged: checks an added line that looks like a diff header ("++ b/…")', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'clean\n++ b/acmecourse-notes.md\n');
    git('add', 'a.md');
  });
  assert.equal(status, 1);
});

test('staged: blocks a new file whose name holds a term, accents and all', () => {
  const status = checkStaged(({ git, write }) => {
    write('notes-acmecourse-é.md', 'clean\n');
    git('add', '.');
  });
  assert.equal(status, 1);
});

test('staged: lets a commit delete a file or a line that names a term', () => {
  const status = checkStaged(({ git, write }) => {
    write('acmecourse.md', 'acmecourse\n');
    write('b.md', 'acmecourse\nkeep\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('rm', '-q', 'acmecourse.md');
    write('b.md', 'keep\n');
    git('add', 'b.md');
  });
  assert.equal(status, 0);
});

test('staged: passes a clean change', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'the benchmark course\n');
    git('add', 'a.md');
  });
  assert.equal(status, 0);
});

test('range (pre-push): blocks a commit whose message names a term', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    write('a.md', 'base\nmore\n');
    git('commit', '-qam', 'feat: match acmecourse lesson 4');
    return ['range', 'HEAD~1..HEAD'];
  });
  assert.equal(status, 1);
});

test('range (pre-push): blocks a commit that adds a line naming a term', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    write('a.md', 'base\nsee acmecourse\n');
    git('commit', '-qam', 'docs: notes');
    return ['range', 'HEAD~1..HEAD'];
  });
  assert.equal(status, 1);
});

test('range (pre-push): passes a commit that removes a mention and deletes a named file', () => {
  const status = checkStaged(({ git, write }) => {
    write('acmecourse.md', 'acmecourse\n');
    write('b.md', 'acmecourse\nkeep\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('rm', '-q', 'acmecourse.md');
    write('b.md', 'keep\n');
    git('commit', '-qam', 'chore: delete what we dropped');
    return ['range', 'HEAD~1..HEAD'];
  });
  assert.equal(status, 0);
});

test('range (pre-push): reads the whole message, even after a line quoting a patch header', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    write('a.md', 'base\nmore\n');
    git('commit', '-qam', 'docs: quote\n\ndiff --git a/x b/x\nsee acmecourse');
    return ['range', 'HEAD~1..HEAD'];
  });
  assert.equal(status, 1);
});

test('range (pre-push): blocks when git log fails (an unfetched remote commit), never passes', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    return ['range', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef..HEAD'];
  });
  assert.equal(status, 1);
});

test('range (pre-push): checks a line added while resolving a merge', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'side');
    write('b.md', 'side\n');
    git('add', '.');
    git('commit', '-qm', 'side');
    git('checkout', '-q', '-');
    git('merge', '-q', '--no-ff', '--no-commit', 'side');
    write('c.md', 'resolved with acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'merge side');
    return ['range', 'HEAD~1..HEAD'];
  });
  assert.equal(status, 1);
});

test('range (pre-push): checks file names even after a binary diff', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    write('acmecourse.bin', '\u0000\u0001binary\n');
    git('add', '.');
    git('commit', '-qm', 'add a file');
    return ['range', 'HEAD~1..HEAD'];
  });
  assert.equal(status, 1);
});

test('range (pre-push): blocks a # line git stored (cleanup verbatim), which msg skipped', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    write('a.md', 'base\nmore\n');
    git('commit', '-qa', '--cleanup=verbatim', '-m', 'feat: x\n\n#12 acmecourse');
    return ['range', 'HEAD~1..HEAD'];
  });
  assert.equal(status, 1);
});

test('staged: a binary file earlier in the diff never stops the scan', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.bin', Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x0a]));
    write('z.md', 'see acmecourse\n');
    git('add', '.');
  });
  assert.equal(status, 1);
});

test('staged: editing a file whose name already holds a term is allowed', () => {
  const status = checkStaged(({ git, write }) => {
    write('acmecourse-notes.md', 'old\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    write('acmecourse-notes.md', 'old\nnew line\n');
    git('add', '.');
  });
  assert.equal(status, 0);
});

test("a worktree finds the main checkout's list (no DENYLIST_FILE)", () => {
  const dir = mkdtempSync(join(tmpdir(), 'denylist-wt-'));
  try {
    const main = join(dir, 'main');
    const git = runGit;
    mkdirSync(join(main, 'scripts'), { recursive: true });
    git(dir, 'init', '-q', main);
    copyFileSync(SCRIPT, join(main, 'scripts', 'denylist-check.sh'));
    git(main, 'add', '.');
    git(main, 'commit', '-qm', 'base');
    // The list stays untracked in the main checkout, as the owner's notes do
    mkdirSync(join(main, 'guided-learning-topics', 'notes'), { recursive: true });
    writeFileSync(join(main, 'guided-learning-topics', 'notes', 'denylist.txt'), 'acmecourse\n');
    const wt = join(dir, 'wt');
    git(main, 'worktree', 'add', '-q', wt);
    writeFileSync(join(wt, 'a.md'), 'see acmecourse\n');
    git(wt, 'add', 'a.md');
    const r = spawnSync('sh', ['scripts/denylist-check.sh', 'staged'], {
      cwd: wt,
      env: cleanEnv(),
      encoding: 'utf8',
    });
    assert.equal(r.status, 1, r.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A repo with a bare remote: `base` pushed (so refs/remotes exist), then `commit` made locally */
function pushSetup(commitMessage, extra = () => {}) {
  return ({ git, write, rev, dir }) => {
    // Inside the temp dir (removed with it), kept out of the repo by its own exclude file
    const remote = join(dir, '.remote.git');
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', remote);
    git('remote', 'add', 'origin', remote);
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('fetch', '-q', 'origin');
    const base = rev(['rev-parse', 'HEAD']);
    write('a.md', 'base\nmore\n');
    git('commit', '-qam', commitMessage);
    const head = rev(['rev-parse', 'HEAD']);
    return (
      extra({ base, head }) ?? {
        args: ['push', 'origin'],
        input: `refs/heads/main ${head} refs/heads/main ${base}\n`,
      }
    );
  };
}

test('push: blocks an existing branch whose new commit names a term', () => {
  assert.equal(checkStaged(pushSetup('feat: acmecourse')), 1);
});

test('push: passes an existing branch with clean commits', () => {
  assert.equal(checkStaged(pushSetup('feat: clean')), 0);
});

test('push: a new branch (zero remote id, SHA-1 or SHA-256 length) checks only unpushed commits', () => {
  for (const zeros of ['0'.repeat(40), '0'.repeat(64)]) {
    const status = checkStaged(
      pushSetup('feat: acmecourse', ({ head }) => ({
        args: ['push', 'origin'],
        input: `refs/heads/new ${head} refs/heads/new ${zeros}\n`,
      }))
    );
    assert.equal(status, 1, zeros.length);
  }
  const clean = checkStaged(
    pushSetup('feat: clean', ({ head }) => ({
      args: ['push', 'origin'],
      input: `refs/heads/new ${head} refs/heads/new ${'0'.repeat(40)}\n`,
    }))
  );
  assert.equal(clean, 0);
});

test('push: an existing branch never rescans commits a remote already has', () => {
  // An old public commit names the term (as this repo's history does); the branch is rebased onto
  // it and pushed with a clean commit of its own
  const status = checkStaged(({ git, write, rev, dir }) => {
    const remote = join(dir, '.remote.git');
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', remote);
    git('remote', 'add', 'origin', remote);
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = rev(['rev-parse', 'HEAD']);
    git('push', '-q', 'origin', `${base}:refs/heads/feature`);
    write('old.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'old public commit: acmecourse');
    git('push', '-q', 'origin', 'HEAD:refs/heads/develop');
    write('b.md', 'clean\n');
    git('add', '.');
    git('commit', '-qm', 'feat: clean');
    git('fetch', '-q', 'origin');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/feature ${head} refs/heads/feature ${base}\n`,
    };
  });
  assert.equal(status, 0);
});

test('staged: a rename to a name that holds a term is caught', () => {
  const status = checkStaged(({ git, write }) => {
    write('notes.md', 'clean text that stays the same\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('mv', 'notes.md', 'acmecourse-notes.md');
  });
  assert.equal(status, 1);
});

test('staged: a new file name is read right with diff.noprefix set', () => {
  const status = checkStaged(({ git, write }) => {
    git('config', 'diff.noprefix', 'true');
    write('acmecourse-notes.md', 'clean\n');
    git('add', '.');
  });
  assert.equal(status, 1);
});

/** A real conflicted merge: upstream's own lines (`upstreamExtra`), then the person's resolution */
function conflictedMerge(upstreamExtra, resolution) {
  return ({ git, gitTry, write }) => {
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'upstream');
    write('a.md', 'theirs\n');
    write('up.md', upstreamExtra);
    git('add', '.');
    git('commit', '-qm', 'upstream work');
    git('checkout', '-q', '-');
    write('a.md', 'ours\n');
    git('commit', '-qam', 'mine');
    assert.notEqual(gitTry('merge', '-q', 'upstream'), 0); // stops on the a.md conflict
    write('a.md', resolution);
    git('add', 'a.md');
  };
}

test("staged (after a conflict): the merged-in side's own lines are not the person's, so pass", () => {
  assert.equal(
    checkStaged(conflictedMerge('already public: acmecourse\n', 'ours and theirs\n')),
    0
  );
});

test('staged (after a conflict): a resolution that adds a term is caught', () => {
  assert.equal(checkStaged(conflictedMerge('up\n', 'resolved with acmecourse\n')), 1);
});

test('staged: a copied file counts as added, whatever it was copied from', () => {
  const status = checkStaged(({ git, write }) => {
    write('x.md', 'line acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    write('y.md', 'line acmecourse\n');
    write('x.md', 'line acmecourse\nextra\n');
    git('add', '.');
  });
  assert.equal(status, 1);
});

test('push: a commit that sits only on another remote is still checked for this one', () => {
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.origin.git/\n.backup.git/\n.list\n');
    for (const name of ['origin', 'backup']) {
      git('init', '-q', '--bare', join(dir, `.${name}.git`));
      git('remote', 'add', name, join(dir, `.${name}.git`));
    }
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    const base = rev(['rev-parse', 'HEAD']);
    write('a.md', 'base\nacmecourse\n');
    git('commit', '-qam', 'feat: x');
    git('push', '-q', 'backup', 'HEAD:refs/heads/main');
    git('fetch', '-q', '--all');
    const head = rev(['rev-parse', 'HEAD']);
    return { args: ['push', 'origin'], input: `refs/heads/main ${head} refs/heads/main ${base}\n` };
  });
  assert.equal(status, 1);
});

test('push: a rebased copy of a public commit that named a term is not new text', () => {
  // An old commit on the public feature branch added a mention (as this repo's history has); the
  // branch is rebased onto an updated main and force-pushed with a clean commit of its own
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('checkout', '-qb', 'feature');
    write('old.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'old work');
    git('push', '-q', 'origin', 'HEAD:refs/heads/feature');
    const oldTip = rev(['rev-parse', 'HEAD']);
    git('checkout', '-q', 'main');
    write('m.md', 'main moved\n');
    git('add', '.');
    git('commit', '-qm', 'main moved');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('checkout', '-q', 'feature');
    git('rebase', '-q', 'main');
    write('b.md', 'clean\n');
    git('add', '.');
    git('commit', '-qm', 'feat: clean');
    git('fetch', '-q', 'origin');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/feature ${head} refs/heads/feature ${oldTip}\n`,
    };
  });
  assert.equal(status, 0);
});

test('push: an annotated tag whose message names a term is blocked', () => {
  const tagged = checkStaged(({ git, write, rev, dir }) => {
    const remote = join(dir, '.remote.git');
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', remote);
    git('remote', 'add', 'origin', remote);
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('fetch', '-q', 'origin');
    git('tag', '-a', 'v1', '-m', 'lessons matched to acmecourse');
    const tag = rev(['rev-parse', 'v1']);
    return {
      args: ['push', 'origin'],
      input: `refs/tags/v1 ${tag} refs/tags/v1 ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(tagged, 1);
});

test('msg: a missing message file blocks, never passes unread', () => {
  const r = spawnSync('sh', [SCRIPT, 'msg', '/nonexistent/msg.txt'], {
    env: cleanEnv({ DENYLIST_FILE: SCRIPT }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 1);
});

test('matches a term on any line of the list, not just the first', () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'see othercourse here\n');
    git('add', '.');
  }, 'acmecourse\nothercourse\n');
  assert.equal(status, 1);
});

test('push: a deleted branch pushes nothing to check', () => {
  const status = checkStaged(
    pushSetup('feat: acmecourse', ({ base }) => ({
      args: ['push', 'origin'],
      input: `(delete) ${'0'.repeat(40)} refs/heads/old ${base}\n`,
    }))
  );
  assert.equal(status, 0);
});

test('push: with no remote refs at all, every commit is new and checked', () => {
  const push = (message) =>
    checkStaged(({ git, write, rev }) => {
      write('a.md', 'x\n');
      git('add', '.');
      git('commit', '-qm', message);
      const head = rev(['rev-parse', 'HEAD']);
      return {
        args: ['push', 'origin'],
        input: `refs/heads/new ${head} refs/heads/new ${'0'.repeat(40)}\n`,
      };
    });
  assert.equal(push('clean'), 0);
  assert.equal(push('names acmecourse'), 1);
});

test("push: amending only a pushed commit's message to name a term is blocked", () => {
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    write('a.md', 'base\nmore\n');
    git('commit', '-qam', 'feat: clean');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('fetch', '-q', 'origin');
    const pushed = rev(['rev-parse', 'HEAD']);
    git('commit', '-q', '--amend', '-m', 'feat: now names acmecourse');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/main ${head} refs/heads/main ${pushed}\n`,
    };
  });
  assert.equal(status, 1);
});

test('push: a new branch to an empty remote treats what other remotes have as public', () => {
  // An old public commit on origin names the term; a clean branch is pushed to a new, empty backup
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.origin.git/\n.backup.git/\n.list\n');
    for (const name of ['origin', 'backup']) {
      git('init', '-q', '--bare', join(dir, `.${name}.git`));
      git('remote', 'add', name, join(dir, `.${name}.git`));
    }
    write('old.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'old public commit');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('fetch', '-q', 'origin');
    write('b.md', 'clean\n');
    git('add', '.');
    git('commit', '-qm', 'feat: clean');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'backup'],
      input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 0);
});

test('staged: a term after a NUL byte on the same line is still found (PNG text, UTF-16)', () => {
  const status = checkStaged(({ git, write }) => {
    write(
      'shot.png',
      Buffer.concat([
        Buffer.from('\x89PNG tEXtTitle'),
        Buffer.from([0]),
        Buffer.from('acmecourse\n'),
      ])
    );
    git('add', '.');
  });
  assert.equal(status, 1);
});

test("msg: with core.commentChar auto, a template line in any of git's comment chars is skipped", () => {
  const status = checkStaged(({ git, dir }) => {
    git('config', 'core.commentChar', 'auto');
    const file = join(dir, 'msg.txt');
    writeFileSync(
      file,
      'feat: delete notes\n; Changes to be committed:\n;\tdeleted: acmecourse-notes.md\n'
    );
    return ['msg', file];
  });
  assert.equal(status, 0);
});

test('msg: strips the merge template comment lines, as git does', () => {
  const message =
    "Merge branch 'x'\n# Please enter a commit message to explain why this merge is necessary,\n# Conflicts:\n#\tacmecourse.md\n";
  assert.equal(checkMessage(message, 'acmecourse\n').status, 0);
});

test('warns, without blocking, when there is no list (a fresh clone)', () => {
  const r = checkMessage('feat: acmecourse\n', undefined);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /No denylist/);
});

test('push: a joined term is new even when a public commit added the same words with a space', () => {
  // The default patch id ignores whitespace: "see acme course" and "see acmecourse" would match
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('checkout', '-qb', 'spaced');
    write('a.md', 'base\nsee acme course\n');
    git('commit', '-qam', 'spaced');
    git('push', '-q', 'origin', 'HEAD:refs/heads/spaced');
    git('checkout', '-q', 'main');
    git('checkout', '-qb', 'joined');
    write('a.md', 'base\nsee acmecourse\n');
    git('commit', '-qam', 'feat: joined');
    git('fetch', '-q', 'origin');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/joined ${head} refs/heads/joined ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 1);
});

test("push: a force-push over a remote commit this clone never fetched isn't blocked", () => {
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('fetch', '-q', 'origin');
    write('b.md', 'clean\n');
    git('add', '.');
    git('commit', '-qm', 'feat: clean');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/main ${head} refs/heads/main ${'ab'.repeat(20)}\n`,
    };
  });
  assert.equal(status, 0);
});

const octopus =
  (resolution) =>
  ({ git, write }) => {
    write('base.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('branch', '-q', 'a');
    git('branch', '-q', 'b');
    git('checkout', '-q', 'a');
    write('a.md', 'already public: acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'historical');
    git('checkout', '-q', 'b');
    write('b.md', 'b\n');
    git('add', '.');
    git('commit', '-qm', 'b');
    git('checkout', '-q', '-');
    git('checkout', '-q', '-');
    git('checkout', '-qB', 'main', 'HEAD~1');
    write('m.md', 'main\n');
    git('add', '.');
    git('commit', '-qm', 'main');
    git('merge', '-q', '--no-commit', '--no-ff', 'a', 'b');
    if (resolution) {
      write('r.md', resolution);
      git('add', '.');
    }
  };

test("staged (octopus merge): the merged-in branches' own lines are not the person's", () => {
  assert.equal(checkStaged(octopus()), 0);
});

test('staged (octopus merge): a line the person adds while merging is caught', () => {
  assert.equal(checkStaged(octopus('mine: acmecourse\n')), 1);
});

test("push: a textconv driver can't make a changed file look like a public copy", () => {
  // The driver shows every .dat file as nothing, so with it both commits' patches would be equal
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    git('config', 'diff.blank.textconv', 'true');
    write('.gitattributes', '*.dat diff=blank\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('checkout', '-qb', 'public');
    write('x.dat', 'meta v1\n');
    git('add', '.');
    git('commit', '-qm', 'data');
    git('push', '-q', 'origin', 'HEAD:refs/heads/public');
    git('checkout', '-q', 'main');
    git('checkout', '-qb', 'mine');
    write('x.dat', 'meta acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'data');
    git('fetch', '-q', 'origin');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/mine ${head} refs/heads/mine ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 1);
});

test('push: a new branch whose name names a term is blocked; an existing one is not re-judged', () => {
  const push = (remoteSha) =>
    checkStaged(({ git, write, rev }) => {
      write('a.md', 'x\n');
      git('add', '.');
      git('commit', '-qm', 'clean');
      const head = rev(['rev-parse', 'HEAD']);
      const remote = remoteSha === 'head' ? head : '0'.repeat(40);
      return {
        args: ['push', 'origin'],
        input: `refs/heads/acmecourse-x ${head} refs/heads/feat/acmecourse-x ${remote}\n`,
      };
    });
  assert.equal(push('new'), 1);
  assert.equal(push('head'), 0);
});

test("push: to a mirror, what origin already has isn't new text", () => {
  // An old commit on origin named the term; a backup remote with other refs gets the branch
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.origin.git/\n.backup.git/\n.list\n');
    for (const name of ['origin', 'backup']) {
      git('init', '-q', '--bare', join(dir, `.${name}.git`));
      git('remote', 'add', name, join(dir, `.${name}.git`));
    }
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'backup', 'HEAD:refs/heads/main');
    write('old.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'old public commit');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    git('fetch', '-q', '--all');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'backup'],
      input: `refs/heads/develop ${head} refs/heads/develop ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 0);
});

test("push: to a new, empty remote, a private remote's commits are still checked", () => {
  // The term sits only on a private backup; a branch holding it goes to a brand-new public mirror
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(
      join(dir, '.git', 'info', 'exclude'),
      '.origin.git/\n.backup.git/\n.mirror.git/\n.list\n'
    );
    for (const name of ['origin', 'backup', 'mirror']) {
      git('init', '-q', '--bare', join(dir, `.${name}.git`));
      git('remote', 'add', name, join(dir, `.${name}.git`));
    }
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    write('b.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'private work');
    git('push', '-q', 'backup', 'HEAD:refs/heads/feat');
    git('fetch', '-q', '--all');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'mirror'],
      input: `refs/heads/feat ${head} refs/heads/feat ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 1);
});

test('msg: a backslash comment character is taken literally (no awk escape processing)', () => {
  const run = (message) =>
    checkStaged(({ git, dir }) => {
      git('config', 'core.commentChar', '\\');
      const file = join(dir, 'msg.txt');
      writeFileSync(file, message);
      return ['msg', file];
    });
  assert.equal(run('feat: x\n\\ Changes to be committed:\n\\\tdeleted: acmecourse.md\n'), 0);
  assert.equal(run('feat: names acmecourse\n\\ a comment\n'), 1);
});

test('staged: a new file whose name git quotes is read back to its characters', () => {
  const status = checkStaged(({ git, write }) => {
    write('acme"course.md', 'x\n');
    git('add', '.');
  }, 'acme"course\n');
  assert.equal(status, 1);
});

test("staged (cherry-pick after a conflict): the picked commit's own lines are not the person's", () => {
  const status = checkStaged(({ git, gitTry, write }) => {
    write('a.md', 'line\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'old');
    write('a.md', 'line from old\nalready public: acmecourse\n');
    git('commit', '-qam', 'old work');
    git('checkout', '-q', '-');
    write('a.md', 'line from main\n');
    git('commit', '-qam', 'main');
    assert.notEqual(gitTry('cherry-pick', 'old'), 0); // stops on the conflict
    write('a.md', 'line from main\nalready public: acmecourse\n');
    git('add', '.');
  });
  assert.equal(status, 0);
});

test('push: a cherry-pick of a commit already on origin is not new text', () => {
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'develop');
    write('old.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'old public commit');
    git('push', '-q', 'origin', 'develop');
    const old = rev(['rev-parse', 'HEAD']);
    git('checkout', '-q', '-b', 'pick', 'HEAD~1');
    // A commit of its own first, so the pick gets a new id (on the same parent, in the same second,
    // git would recreate the original commit exactly)
    write('b.md', 'clean\n');
    git('add', '.');
    git('commit', '-qm', 'feat: clean');
    git('cherry-pick', old);
    git('fetch', '-q', 'origin');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/pick ${head} refs/heads/pick ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 0);
});

test('msg: a look-alike scissors line that is not a comment does not hide what follows', () => {
  const message =
    'feat: x\nx ------------------------ >8 ------------------------\nnames acmecourse\n';
  assert.equal(checkMessage(message, 'acmecourse\n').status, 1);
});

test("staged (merge -s ours): lines HEAD already had are not the person's", () => {
  const status = checkStaged(({ git, write }) => {
    write('a.md', 'kept: acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'other');
    write('a.md', 'changed on the other side\n');
    git('commit', '-qam', 'other');
    git('checkout', '-q', '-');
    write('b.md', 'main\n');
    git('add', '.');
    git('commit', '-qm', 'main');
    git('merge', '-q', '--no-commit', '-s', 'ours', 'other');
  });
  assert.equal(status, 0);
});

test("staged (rebase stopped on a conflict): the rebased commit's own lines are not the person's", () => {
  const status = checkStaged(({ git, gitTry, write }) => {
    write('a.md', 'line\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'topic');
    write('a.md', 'line from topic\nalready public: acmecourse\n');
    git('commit', '-qam', 'topic work');
    git('checkout', '-q', '-');
    write('a.md', 'line from main\n');
    git('commit', '-qam', 'main');
    git('checkout', '-q', 'topic');
    assert.notEqual(gitTry('rebase', '-q', '-'), 0); // stops on the conflict
    write('a.md', 'line from main\nalready public: acmecourse\n');
    git('add', '.');
  });
  assert.equal(status, 0);
});

test('push: a line an octopus merge adds itself is caught', () => {
  const status = checkStaged(({ git, write, rev }) => {
    write('base.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('branch', '-q', 'base');
    for (const name of ['x', 'y']) {
      git('checkout', '-qb', name, 'base');
      write(`${name}.md`, `${name}\n`);
      git('add', '.');
      git('commit', '-qm', name);
    }
    git('checkout', '-q', 'base');
    // A commit of its own, so the merge can't fast-forward to x (it must keep 3 parents)
    write('own.md', 'own\n');
    git('add', '.');
    git('commit', '-qm', 'own');
    git('merge', '-q', '--no-commit', 'x', 'y');
    write('added.md', 'names acmecourse\n');
    git('add', '.');
    git('commit', '-q', '--no-verify', '-m', 'merge x and y');
    assert.equal(rev(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').length, 4);
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 1);
});

test('push: reverting a public cleanup (its text comes back) is not new text', () => {
  const status = checkStaged(({ git, write, rev, dir }) => {
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    write('a.md', 'see acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'old');
    write('a.md', 'see the benchmark\n');
    git('commit', '-qam', 'cleanup');
    git('push', '-q', 'origin', 'HEAD:refs/heads/develop');
    git('fetch', '-q', 'origin');
    git('revert', '--no-edit', 'HEAD');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/fix ${head} refs/heads/fix ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 0);
});

test('msg: a `#12 …` line from `git commit -m` is message text, not template, so it blocks', () => {
  assert.equal(checkMessage('fix: x\n\n#12 acmecourse notes\n', 'acmecourse\n').status, 1);
});

test('a list saved with a UTF-8 byte-order mark still matches its first term', () => {
  assert.equal(checkMessage('feat: names acmecourse\n', '﻿acmecourse\n').status, 1);
});

test('push: a root commit is scanned even with log.showRoot=false', () => {
  const status = checkStaged(({ git, write, rev }) => {
    git('config', 'log.showRoot', 'false');
    write('a.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'first');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/x ${head} refs/heads/x ${'0'.repeat(40)}\n`,
    };
  });
  assert.equal(status, 1);
});

test("push: copy detection doesn't depend on log.abbrevCommit", () => {
  // A rebased copy of a public commit that named a term, with short commit ids configured
  const status = checkStaged(({ git, write, rev, dir }) => {
    git('config', 'log.abbrevCommit', 'true');
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '.remote.git/\n.list\n');
    git('init', '-q', '--bare', join(dir, '.remote.git'));
    git('remote', 'add', 'origin', join(dir, '.remote.git'));
    write('a.md', 'base\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('push', '-q', 'origin', 'HEAD:refs/heads/develop');
    git('checkout', '-qb', 'feature');
    write('old.md', 'acmecourse\n');
    git('add', '.');
    git('commit', '-qm', 'old work');
    git('push', '-q', 'origin', 'HEAD:refs/heads/feature');
    const oldTip = rev(['rev-parse', 'HEAD']);
    git('checkout', '-q', '-');
    write('m.md', 'moved\n');
    git('add', '.');
    git('commit', '-qm', 'moved');
    git('push', '-q', 'origin', 'HEAD:refs/heads/develop');
    git('checkout', '-q', 'feature');
    git('rebase', '-q', '-');
    git('fetch', '-q', 'origin');
    const head = rev(['rev-parse', 'HEAD']);
    return {
      args: ['push', 'origin'],
      input: `refs/heads/feature ${head} refs/heads/feature ${oldTip}\n`,
    };
  });
  assert.equal(status, 0);
});
