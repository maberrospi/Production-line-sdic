# Production Line

A hands-on system design course, from one VM to many. Thirteen levels take one app from a single
server through scaling out, caching, databases, replication, sharding, consensus, events, APIs,
reliability, infrastructure and security, ending with design case studies. Every level has
interactive lessons, a checkpoint quiz, an exam and a lab you run yourself.

## Open the course

- **Locally:** open `course/index.html` in a browser, or serve it:
  `cd course && python3 -m http.server 8000`, then visit http://localhost:8000.
- Your progress is saved in your browser. **Progress file** in the top bar exports it to a file or
  merges a file back in, so you can move between browsers or machines.

## Run the labs

Each folder in `labs/` is self-contained. You need Docker with Docker Compose; some labs also use k6,
kind and kubectl, or OpenTofu, as listed at the top of each lab. Start each lab from the course's **Lab** tab for
that level: every step explains why it is done and has a worked solution with real output.

All lab services bind to 127.0.0.1 and use throwaway demo credentials. Do not reuse them anywhere real.

The **Check on your VM** sections are read-only commands for comparing a real server of your own
with what each level teaches. None of them changes anything.

## Sources

Each lesson lists the documentation, papers and books it is based on, with links.
