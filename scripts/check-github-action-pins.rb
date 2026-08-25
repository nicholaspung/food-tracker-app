#!/usr/bin/env ruby

require "yaml"
require "set"

module GitHubActionPinPolicy
  REMOTE_REFERENCE = %r{\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_./-]+)?@[0-9A-Fa-f]{40}\z}
  DOCKER_REFERENCE = %r{\Adocker://\S+@sha256:[0-9A-Fa-f]{64}\z}
  LOCAL_REFERENCE = %r{\A(?:\.|\$)/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*\z}

  module_function

  def violations(workflows_directory)
    workflow_errors = workflow_paths(workflows_directory).flat_map do |workflow_path|
      workflow_violations(workflow_path, workflows_directory)
    end

    action_errors = action_manifest_paths(workflows_directory).flat_map do |action_path|
      action_manifest_violations(action_path, workflows_directory)
    end

    workflow_errors + action_errors
  end

  def valid_reference?(reference)
    return false unless reference.is_a?(String)
    return false if reference.include?("${{")
    return valid_local_reference?(reference) if reference.start_with?("./", "$/")

    REMOTE_REFERENCE.match?(reference) || DOCKER_REFERENCE.match?(reference)
  end

  def valid_local_reference?(reference)
    LOCAL_REFERENCE.match?(reference) && reference.split("/").none? { |segment| segment == ".." }
  end

  def workflow_paths(workflows_directory)
    Dir.glob(
      File.join(workflows_directory, "**", "*.{yml,yaml}"),
      File::FNM_DOTMATCH
    ).sort
  end

  def action_manifest_paths(workflows_directory)
    actions_directory = File.join(File.dirname(workflows_directory), "actions")
    discovered = Dir.glob(
      File.join(actions_directory, "**", "{action.yml,action.yaml}"),
      File::FNM_DOTMATCH
    ).to_set
    processed = Set.new
    pending = workflow_paths(workflows_directory).flat_map do |workflow_path|
      local_step_references(workflow_path, workflow: true)
    end

    until pending.empty?
      reference = pending.shift
      action_path = resolve_local_action_manifest(reference, workflows_directory)
      next unless action_path
      next unless processed.add?(action_path)

      discovered.add(action_path)
      pending.concat(local_step_references(action_path, workflow: false))
    end

    discovered.to_a.sort
  end

  def local_step_references(path, workflow:)
    document = YAML.safe_load(
      File.read(path),
      permitted_classes: [],
      permitted_symbols: [],
      aliases: true,
      filename: path
    )
    steps = if workflow
      jobs = document.is_a?(Hash) ? document["jobs"] : nil
      jobs.is_a?(Hash) ? jobs.values.flat_map { |job| job.is_a?(Hash) && job["steps"].is_a?(Array) ? job["steps"] : [] } : []
    else
      runs = document.is_a?(Hash) ? document["runs"] : nil
      runs.is_a?(Hash) && runs["steps"].is_a?(Array) ? runs["steps"] : []
    end

    steps.each_with_object([]) do |step, references|
      reference = step.is_a?(Hash) ? step["uses"] : nil
      if reference.is_a?(String) && reference.start_with?("./", "$/") && valid_local_reference?(reference)
        references << reference
      end
    end
  rescue Psych::Exception
    []
  end

  def resolve_local_action_manifest(reference, workflows_directory)
    repository_root = File.expand_path("../..", workflows_directory)
    relative_path = reference.sub(%r{\A(?:\./|\$/)}, "")
    action_directory = File.expand_path(relative_path, repository_root)
    return unless action_directory.start_with?("#{repository_root}/")

    %w[action.yml action.yaml].each do |filename|
      candidate = File.join(action_directory, filename)
      return candidate if File.file?(candidate)
    end

    nil
  end

  def workflow_violations(workflow_path, workflows_directory)
    workflow = YAML.safe_load(
      File.read(workflow_path),
      permitted_classes: [],
      permitted_symbols: [],
      aliases: true,
      filename: workflow_path
    )
    jobs = workflow.is_a?(Hash) ? workflow["jobs"] : nil
    return [] unless jobs.is_a?(Hash)

    relative_path = workflow_path.delete_prefix("#{workflows_directory}/")

    jobs.flat_map do |job_name, job|
      next [] unless job.is_a?(Hash)

      locations = []
      locations << ["jobs.#{job_name}.uses", job["uses"]] if job.key?("uses")

      if job["steps"].is_a?(Array)
        job["steps"].each_with_index do |step, index|
          next unless step.is_a?(Hash) && step.key?("uses")

          locations << ["jobs.#{job_name}.steps[#{index}].uses", step["uses"]]
        end
      end

      locations.each_with_object([]) do |(location, reference), errors|
        next if valid_reference?(reference)

        errors << "#{relative_path}: #{location} must use ./ for repository-local code or an immutable full commit SHA (found #{reference.inspect})"
      end
    end
  rescue Psych::Exception => error
    ["#{workflow_path}: could not parse workflow YAML (#{error.message})"]
  end

  def action_manifest_violations(action_path, workflows_directory)
    action = YAML.safe_load(
      File.read(action_path),
      permitted_classes: [],
      permitted_symbols: [],
      aliases: true,
      filename: action_path
    )
    runs = action.is_a?(Hash) ? action["runs"] : nil
    repository_root = File.expand_path("../..", workflows_directory)
    relative_path = action_path.delete_prefix("#{repository_root}/")
    errors = []

    if runs.is_a?(Hash) && runs["steps"].is_a?(Array)
      runs["steps"].each_with_index do |step, index|
        next unless step.is_a?(Hash) && step.key?("uses")
        next if valid_reference?(step["uses"])

        errors << "#{relative_path}: runs.steps[#{index}].uses must use ./ for repository-local code or an immutable full commit SHA (found #{step["uses"].inspect})"
      end
    end

    if runs.is_a?(Hash) && runs["using"] == "docker"
      image = runs["image"]
      if image.is_a?(String) && image.start_with?("docker://") && !DOCKER_REFERENCE.match?(image)
        errors << "#{relative_path}: runs.image must use a repository Dockerfile or an immutable sha256 digest (found #{image.inspect})"
      end
    end

    errors
  rescue Psych::Exception => error
    ["#{action_path}: could not parse action YAML (#{error.message})"]
  end
end

if $PROGRAM_NAME == __FILE__
  if ARGV.length > 1
    warn "Usage: ruby scripts/check-github-action-pins.rb [workflows-directory]"
    exit 2
  end

  workflows_directory = ARGV.fetch(0, ".github/workflows")
  violations = GitHubActionPinPolicy.violations(workflows_directory)

  if violations.empty?
    puts "All external GitHub Action references are pinned to immutable commits."
  else
    warn "Mutable or invalid GitHub Action references found:"
    violations.each { |violation| warn "- #{violation}" }
    exit 1
  end
end
