pipeline {
    agent any

    environment {
        APP_NAME = 'backend'
        DOCKER_REGISTRY_FOR_KANIKO = 'docker-registry.iac.svc.cluster.local:5000'
        DOCKER_REGISTRY_FOR_HELM = 'localhost:30500'
        NAMESPACE = 'app'
        HELM_CHART_PATH = './helm'
        VERSION = "${env.BUILD_NUMBER}"

        // Credentials (add in Jenkins > Manage Credentials) 
        // - gh_pat_repo: Fine-grained PAT with contents:write and pull-requests:write 
        // - github_repo_url: URL of the BACKEND repo (ex: https://github.com/codegik/backend.git)
        GH_TOKEN = credentials('gh_pat_repo')
        GITHUB_REPO_URL = credentials('github_repo_url')

        // Ollama Endpoint (provisioned in the Terraform section below)
        OLLAMA_HOST = 'http://ollama.iac.svc.cluster.local:11434'
        OLLAMA_MODEL = 'deepseek-coder:latest'
    }

    stages {
        stage('Run Tests') {
            agent {
                kubernetes {
                    yaml """
                    apiVersion: v1
                    kind: Pod
                    spec:
                      containers:
                      - name: node
                        image: node:22-alpine
                        command: ["sh","-lc","sleep infinity"]
                        workingDir: /home/jenkins/agent
                    """
                    defaultContainer 'node'
                }
            }
            steps {
                dir('deployment-system/app/backend') {
                    script {
                        sh 'npm ci'
                        // Run your runner with JUnit enabled (e.g. JUNIT=1 with Jest/Vitest)
                        int status = sh(returnStatus: true, script: 'set -o pipefail; JUNIT=1 npm run test:ci | tee build.log')
                        env.TEST_FAILED = (status != 0) ? '1' : '0'
                        if (env.TEST_FAILED == '1') { currentBuild.result = 'FAILURE' }
                    }
                }
            }
            post {
                always {
                    dir('deployment-system/app/backend') {
                        // ALWAYS publish JUnit and artifacts (even if it fails)
                        junit allowEmptyResults: true, testResults: '**/junit*.xml,**/junit.xml,**/test-results/*.xml'
                        archiveArtifacts artifacts: 'build.log,**/junit*.xml,**/junit.xml,**/test-results/*.xml', fingerprint: true, onlyIfSuccessful: false
                    }
                }
            }
        }


        stage('Auto-Fix & PR (on failure only)') {
            when {
                expression { currentBuild.rawBuild.getPreviousBuild()?.getResult()?.toString() != 'SUCCESS' || currentBuild.currentResult == 'FAILURE' }
            }
            agent {
                kubernetes {
                    yaml """
                        apiVersion: v1
                        kind: Pod
                        spec:
                        containers:
                        - name: node
                            image: node:22-alpine
                            command: ["sh","-lc","sleep infinity"]
                            workingDir: /home/jenkins/agent
                        - name: gh
                            image: ghcr.io/cli/cli:latest
                            command: ["sh","-lc","sleep infinity"]
                            workingDir: /home/jenkins/agent
                        """
                    defaultContainer 'node'
                }
            }

            steps {
                dir('deployment-system/app/backend') {
                    sh '''
                    set -euo pipefail

                    # == Preparing fix branch ==
                    git config --global user.name  "ci-fix-bot"
                    git config --global user.email "ci-fix-bot@example.local"
                    git remote set-url origin "$GITHUB_REPO_URL"
                    git fetch origin
                    BASE=${CHANGE_TARGET:-main}
                    FIX="ci-fix/${BRANCH_NAME:-${GIT_BRANCH##*/}}-${BUILD_NUMBER}"
                    git checkout -B "$FIX" "origin/$BASE" || git checkout -B "$FIX"

                    # == Cheap heuristic: lint --fix / format ==
                    npm run lint -- --fix || true
                    npm run format || true 2>/dev/null || true

                    # == Re-run tests after auto-fix ==
                    set +e
                    npm test
                    TEST_STATUS=$?
                    set -e

                    # == Collect context for the report ==
                    mkdir -p .jenkins/ctx
                    cp -f build.log .jenkins/ctx/ 2>/dev/null || true
                    cp -f lint.json .jenkins/ctx/ 2>/dev/null || true
                    find . \( -name "junit*.xml" -o -name "junit.xml" -o -name "*.xml" \) -type f \
                        | head -n 20 \
                        | xargs -I{} cp {} .jenkins/ctx/ 2>/dev/null || true

                    if [ $TEST_STATUS -eq 0 ]; then
                        echo "==> Auto-fix succeeded: creating PR with lint/format changes"
                        if ! git diff --quiet; then
                        git add -A
                        git commit -m "ci: auto-fix (lint/format) after CI failure in ${JOB_NAME}#${BUILD_NUMBER}"
                        git push -u origin "$FIX"

                        # Build a concise PR body
                        {
                            echo "Build ${JOB_NAME}#${BUILD_NUMBER} failed, but auto-fix (lint/format) made tests pass."
                            echo
                            echo "Files were adjusted automatically by linters/formatters."
                        } > .jenkins/last_fix_report.md

                        GH_TOKEN_MASKED="$(echo "$GH_TOKEN")"
                        /bin/sh -lc '
                            gh auth status || gh auth login --with-token <<< "$GH_TOKEN_MASKED";
                            gh pr create \
                            --base "$BASE" --head "$FIX" \
                            --title "CI auto-fix: ${JOB_NAME}#${BUILD_NUMBER}" \
                            --body-file .jenkins/last_fix_report.md \
                            --label "ci:auto-fix" --draft=false
                        '
                        else
                        echo "Nothing to commit. Skipping PR."
                        fi
                    else
                        echo "==> Still failing: requesting analysis from LLM (Ollama) and creating a report PR"

                        # Compact logs for the prompt (keeps size under model limits)
                        CONTEXT="$(
                        { echo "BUILD LOG:"; sed -n "1,2000p" build.log 2>/dev/null || true; \
                            echo; echo "LINT JSON:"; head -c 120000 lint.json 2>/dev/null || true; } \
                        | sed "s/\"/'/g"
                        )"

                        # Seed a JSON template and inject fields via jq
                        cat > .jenkins/prompt.json <<'JSON'
                    {
                    "model": "",
                    "prompt": ""
                    }
                    JSON

                        jq -c \
                        --arg model "$OLLAMA_MODEL" \
                        --arg p "Você é um agente de CI para Node.js. Analise os logs a seguir e:
                    1) Explique a causa raiz.
                    2) Liste EXACTAMENTE os arquivos que devem ser alterados e trechos de código ANTES/DEPOIS.
                    3) Gere um patch unified diff válido (formato 'diff --git ...') APENAS se tiver alta confiança. Caso contrário, deixe a seção de patch vazia.
                    4) Inclua passos locais para reproduzir e confirmar o fix (npm ci; comandos de build/test específicos do projeto).

                    Logs e contexto:
                    $CONTEXT
                    " \
                        '.model=$model | .prompt=$p' \
                        .jenkins/prompt.json > .jenkins/prompt_req.json

                        echo "==> Calling Ollama at $OLLAMA_HOST"
                        curl -sS -X POST "$OLLAMA_HOST/api/generate" \
                        -H "Content-Type: application/json" \
                        -d @.jenkins/prompt_req.json \
                        | jq -r '.response' > .jenkins/llm_report.md \
                        || echo "(LLM request failed)" > .jenkins/llm_report.md

                        # If the LLM produced a unified diff, extract it to a file
                        awk '/^diff --git /{flag=1} flag{print}' .jenkins/llm_report.md > .jenkins/llm_patch.diff || true
                        if [ -s ".jenkins/llm_patch.diff" ]; then
                        echo "==> Patch detected from LLM. Applying in safe (best-effort) mode."
                        set +e
                        git apply --index --reject .jenkins/llm_patch.diff
                        APPLY_STATUS=$?
                        set -e
                        if [ $APPLY_STATUS -eq 0 ] && ! git diff --cached --quiet; then
                            git commit -m "ci: LLM-suggested patch after failure in ${JOB_NAME}#${BUILD_NUMBER}"
                        fi
                        fi

                        # Push branch (with or without patch) and open PR with the report
                        git push -u origin "$FIX" || true

                        {
                        echo "# Automated CI Failure Report"
                        echo
                        echo "Job: ${JOB_NAME}#${BUILD_NUMBER}"
                        echo "Branch: $FIX (base: $BASE)"
                        echo
                        echo "## LLM Analysis"
                        cat .jenkins/llm_report.md
                        echo
                        echo "## Attached artifacts"
                        for f in .jenkins/ctx/* 2>/dev/null; do echo "- \`$f\`"; done
                        if [ -s ".jenkins/llm_patch.diff" ]; then
                            echo
                            echo "## Suggested patch (also attached in the PR)"
                            echo "\\`\\`\\`diff"
                            sed -n '1,400p' .jenkins/llm_patch.diff
                            echo "\\`\\`\\`"
                        fi
                        } > .jenkins/last_fix_report.md

                        GH_TOKEN_MASKED="$(echo "$GH_TOKEN")"
                        /bin/sh -lc '
                        gh auth status || gh auth login --with-token <<< "$GH_TOKEN_MASKED";
                        gh pr create \
                            --base "$BASE" --head "$FIX" \
                            --title "CI auto-fix (LLM-assisted): ${JOB_NAME}#${BUILD_NUMBER}" \
                            --body-file .jenkins/last_fix_report.md \
                            --label "ci:auto-fix" --draft=true
                        '
                    fi
                    '''
                }
            }
        }

        stage('Build and Push with Kaniko') {
            when { expression { currentBuild.currentResult == 'SUCCESS' } }
            agent {
                kubernetes {
                    yaml """
                    apiVersion: v1
                    kind: Pod
                    spec:
                      containers:
                      - name: kaniko
                        image: gcr.io/kaniko-project/executor:debug
                        imagePullPolicy: Always
                        command: ["sh","-lc","sleep infinity"]
                    """
                    defaultContainer 'kaniko'
                }
            }
            steps {
                dir('deployment-system/app/backend') {
                    sh """
                    /kaniko/executor --context=\$(pwd) \
                                     --destination=${DOCKER_REGISTRY_FOR_KANIKO}/${APP_NAME}:${VERSION} \
                                     --insecure \
                                     --skip-tls-verify
                    """
                }
            }
        }

        stage('Deploy') {
            when { expression { currentBuild.currentResult == 'SUCCESS' } }
            agent {
                kubernetes {
                    yaml """
                    apiVersion: v1
                    kind: Pod
                    spec:
                      containers:
                      - name: helm-kubectl
                        image: dtzar/helm-kubectl:latest
                        command: ["sh","-lc","sleep infinity"]
                    """
                    defaultContainer 'helm-kubectl'
                }
            }
            steps {
                dir('deployment-system/app/backend') {
                    sh """
                    sed -i 's|tag: .*|tag: ${VERSION}|g' ${HELM_CHART_PATH}/values.yaml
                    sed -i 's|repository: .*|repository: ${DOCKER_REGISTRY_FOR_HELM}/${APP_NAME}|g' ${HELM_CHART_PATH}/values.yaml
                    """

                    echo "Deploying with Helm..."
                    sh "helm upgrade --install ${APP_NAME} ${HELM_CHART_PATH} --namespace ${NAMESPACE}"

                    echo "Verifying deployment..."
                    sh "kubectl rollout status deployment/${APP_NAME} -n ${NAMESPACE}"
                    sh "kubectl get pods -l app=${APP_NAME} -n ${NAMESPACE}"
                }
            }
        }
    }

    post {
        success {
            echo "Deployment of ${APP_NAME} completed successfully!"
        }
        failure {
            echo "Deployment of ${APP_NAME} failed!"
        }
    }
}