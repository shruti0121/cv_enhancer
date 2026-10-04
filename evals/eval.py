import json #(lets us convert from string to json and vice-versa )
import logging #let's us log in the cloudwatch (print like) 
import os #lambda has envrionment variables lets us use them 
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path


import boto3 #library to call aws services such as bedrock 

logger = logging.getLogger() 
# Created outside the handler so they're reused across warm invocations
bedrock = boto3.client("bedrock-runtime")
MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"



# Limits keep costs predictable and block oversized requests
MAX_JOB_DESCRIPTION_CHARS = 6000
MAX_BULLETS_CHARS = 3000

SYSTEM_PROMPT = """You are an expert resume writer helping a job seeker tailor their resume.

Rewrite each of the user's resume bullets so it better matches the job description.

Rules:
- Start each bullet with a strong action verb.
- Emphasize results and impact, and use keywords from the job description where they honestly apply.
- If the experience is unrelated to the job, improve the wording and highlight transferable skills such as training, teamwork, reliability, or customer service. Do not mention any tools, technologies, or duties from the job description that the original does not include
- Never invent numbers, metrics, tools, technologies, or achievements that are not in the original bullets.
- If a bullet has no measurable result, strengthen the wording without adding fake numbers.
- Keep each bullet to one or two lines.
- Return the same number of bullets as the user provided.
- Return only the rewritten bullets, one per line, each starting with "- ". No introduction or explanation."""


def respond(status_code, body):
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps(body), #same as stringify converts python dictionary into json string
    } #this is how api gateway expects result in the form and it will convert it into http 

cases = json.loads((Path(__file__).parent / "cases.json").read_text())

passed = 0

for case in cases:
    # CHANGED: these come from the test case instead of the browser
    job_description = case["jobDescription"]
    bullets = case["bullets"]

    # UNCHANGED: the exact same Bedrock call as the Lambda
    response = bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": SYSTEM_PROMPT}],
        messages=[
            {
                "role": "user",
                "content": [
                    {"text": f"Job description:\n{job_description}\n\nMy resume bullets:\n{bullets}"}
                ],
            }
        ],
        inferenceConfig={"maxTokens": 1000, "temperature": 0.3},
    )

    enhanced = response["output"]["message"]["content"][0]["text"].strip()

    problems = []

    input_lines = [line for line in bullets.splitlines() if line.strip()]
    output_lines = [line for line in enhanced.splitlines() if line.strip()]

    if len(output_lines) != len(input_lines):
        problems.append(f"expected {len(input_lines)} bullets, got {len(output_lines)}")

    if any(not line.startswith("- ") for line in output_lines):
        problems.append("a line doesn't start with '- '")

    numbers_in = set(re.findall(r"(?<![A-Za-z])\d+", bullets))
    numbers_out = set(re.findall(r"(?<![A-Za-z])\d+", enhanced))
    if numbers_out - numbers_in:
        problems.append(f"invented numbers: {numbers_out - numbers_in}")

    for phrase in case.get("forbiddenPhrases", []):
        if phrase.lower() in enhanced.lower():
            problems.append(f"contains forbidden phrase: {phrase}")

    # Print the result for this case
    if problems:
        print(f"FAIL  {case['id']}")
        for p in problems:
            print(f"      - {p}")
    else:
        passed += 1
        print(f"PASS  {case['id']}")
    print(f"      {enhanced.replace(chr(10), chr(10) + '      ')}\n")

print(f"\n{passed}/{len(cases)} cases passed")