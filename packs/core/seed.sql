INSERT INTO documents (id, source, title, url, body_html, attribution) VALUES
(
  'aspnetcore/dependency-injection',
  'aspnetcore',
  'Dependency injection in ASP.NET Core',
  'https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection',
  '<p>ASP.NET Core supports the dependency injection (DI) software design pattern, which is a technique for achieving Inversion of Control (IoC) between classes and their dependencies.</p><p>A service is an object that provides service to the application, such as a logging service. Services are registered in the application container during startup.</p><pre><code>builder.Services.AddScoped<IMyDependency, MyDependency>();</code></pre>',
  'Documentation derived from Microsoft Learn documentation, licensed under CC BY 4.0.'
),
(
  'typescript/interfaces',
  'typescript',
  'TypeScript Interfaces and Object Types',
  'https://www.typescriptlang.org/docs/handbook/2/objects.html',
  '<p>In TypeScript, object types are defined using interfaces or type aliases. An interface declaration is another way to name an object type.</p><pre><code>interface Person {\n  name: string;\n  age: number;\n}</code></pre><p>Interfaces can be extended to create new interfaces by copying members from existing types.</p>',
  'Documentation derived from TypeScript Handbook, licensed under Apache-2.0.'
),
(
  'git/rebase',
  'git',
  'Git Rebase - Forward-port local commits to the updated upstream head',
  'https://git-scm.com/docs/git-rebase',
  '<p>If &lt;branch&gt; is specified, git rebase will perform an automatic git switch &lt;branch&gt; before doing anything else. Otherwise it remains on the current branch.</p><p>Rebasing reapplies commits on top of another base tip, creating a linear project history.</p>',
  'Documentation derived from Git Documentation, licensed under GPLv2 and MIT.'
),
(
  'docker/cli',
  'docker',
  'Docker CLI Reference and Commands',
  'https://docs.docker.com/reference/cli/docker/',
  '<p>The base Docker command is used to manage images, containers, networks, and volumes. Use docker run to execute a container in detached mode or with port mappings.</p><pre><code>docker run -d -p 8080:8080 --name my-app my-image:latest</code></pre>',
  'Documentation derived from Docker Docs, licensed under Apache-2.0.'
);
