import json #(lets us convert from string to json and vice-versa )
import logging #let's us log in the cloudwatch (print like) 
import os #lambda has envrionment variables lets us use them 
import uuid
from datetime import datetime, timezone

import boto3 #library to call aws services such as bedrock 

logger = logging.getLogger() 
# Created outside the handler so they're reused across warm invocations
bedrock = boto3.client("bedrock-runtime")
MODEL_ID = os.environ["MODEL_ID"]

HEADERS = {
    "Access-Control-Allow-Origin": "https://cvenhancer.shruti-singla.com",
    "Content-Type": "application/json",
} #attached to every response so browser knows it can read the response

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

def handler(event, context):
    # API Gateway sends the request body as a string
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return respond(400, {"error": "Request body must be valid JSON"})

    job_description = str(body.get("jobDescription") or "").strip()
    bullets = str(body.get("bullets") or "").strip()

    if not job_description or not bullets:
        return respond(400, {"error": "jobDescription and bullets are required"})
    if len(job_description) > MAX_JOB_DESCRIPTION_CHARS or len(bullets) > MAX_BULLETS_CHARS:
        return respond(400, {"error": "Input is too long"})

    try:
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

        return respond(200, {"enhanced": enhanced})

    except Exception:
        logger.exception("Enhance failed")
        return respond(500, {"error": "Something went wrong"})