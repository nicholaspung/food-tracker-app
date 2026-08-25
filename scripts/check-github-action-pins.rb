#!/usr/bin/env ruby

require "yaml"

module GitHubActionPinPolicy
  REMOTE_REFERENCE = %r{\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_./-]+)?@[0-9A-Fa-f]{40}\z}
  DOCKER_REFERENCE = %r{\Adocker://\S+@sha256:[0-9A-Fa-f]{64}\z}
  LOCAL_REFERENCE = %r{\A(?:\.|\$)/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*\z}

  module_function

  def violations(workflows_directory)
    workflow_paths(workflows_directory).flat_map do |workflow_path|
      workflow_violations(workflow_path, workflows_directory)
    end
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
