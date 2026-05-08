
-- 1) 收紧已有数据：超过 6 字截断 + 重复者改名
UPDATE public.profiles
SET display_name = substr(display_name, 1, 6)
WHERE char_length(display_name) > 6;

-- 解决潜在重复：把后到的重名改成 道友·xxxxxx 短码（之后会再被触发器规整）
WITH dups AS (
  SELECT id, display_name,
         row_number() OVER (PARTITION BY display_name ORDER BY created_at) AS rn
  FROM public.profiles
)
UPDATE public.profiles p
SET display_name = substr('友' || substr(p.id::text, 1, 5), 1, 6)
FROM dups
WHERE p.id = dups.id AND dups.rn > 1;

-- 2) 唯一约束 + 长度约束
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_name_key;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_key UNIQUE (display_name);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_display_name_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 6);

-- 3) 古风名生成函数
CREATE OR REPLACE FUNCTION public.random_ancient_name()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pool text[] := ARRAY[
    '青衫客','白鹿吟','墨九','沧溟子','听雪','问月','临渊','扶摇','怀霜','子衿',
    '长歌','莫离','燕千幻','洛白','墨砚','清欢','慕辰','南柯','北辞','东篱',
    '西窗','寻舟','观鱼','拾桐','落雁','惊鸿','拂尘','陌上','云深','听竹',
    '烟岚','岚月','疏影','暗香','子虚','无相','归鸿','寒江雪','孤鹜','秋水',
    '残月','晚晴','静川','沉砚','流光','卧雪','望舒','曦和','宿玄','霁川',
    '渡鹤','寻萤','执剑','拈花','听潮','追风','枕梦','寄云','惜墨','三川',
    '独钓','空山','幽篁','纳兰','顾长歌','柳青','苏白','沈砚','叶知秋','陆离'
  ];
  candidate text;
  attempt int := 0;
BEGIN
  LOOP
    candidate := pool[1 + floor(random() * array_length(pool, 1))::int];
    IF char_length(candidate) > 6 THEN
      candidate := substr(candidate, 1, 6);
    END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE display_name = candidate);
    attempt := attempt + 1;
    IF attempt > 25 THEN
      -- 兜底：拼随机短后缀，确保不超过 6 字
      candidate := substr(candidate, 1, 4) || lpad(floor(random()*100)::text, 2, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE display_name = candidate);
    END IF;
    IF attempt > 50 THEN
      candidate := substr('客' || substr(gen_random_uuid()::text, 1, 5), 1, 6);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- 4) 更新 validate_display_name 触发器
CREATE OR REPLACE FUNCTION public.validate_display_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 空 → 随机古风名
  IF NEW.display_name IS NULL OR length(trim(NEW.display_name)) = 0 THEN
    NEW.display_name := public.random_ancient_name();
  END IF;

  NEW.display_name := trim(NEW.display_name);

  -- 拒绝纯数字 / 电话样式
  IF NEW.display_name ~ '^[0-9+\-\s]{4,}$' THEN
    NEW.display_name := public.random_ancient_name();
  END IF;

  -- 截断到 6 字
  IF char_length(NEW.display_name) > 6 THEN
    NEW.display_name := substr(NEW.display_name, 1, 6);
  END IF;

  -- 重名 → 换随机古风名（INSERT 时 / UPDATE 改名时）
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE display_name = NEW.display_name
      AND id <> NEW.id
  ) THEN
    NEW.display_name := public.random_ancient_name();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_display_name ON public.profiles;
CREATE TRIGGER profiles_validate_display_name
BEFORE INSERT OR UPDATE OF display_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_display_name();

-- 5) 调整 handle_new_user：不再用游客·xxxxxx / 邮箱前缀做默认道号
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  beasts text[] := ARRAY['饕餮','穷奇','梼杌','混沌','烛龙','毕方','九尾','应龙','重明','鲲','鹏','白泽','麒麟','化蛇','陆吾','英招','钦原','蛊雕','凤凰','朱雀','玄武','青龙','驺虞','犼','睚眦','狻猊','貔貅','狴犴','蒲牢','嘲风','椒图','负屃','螭吻','赑屃','囚牛'];
  rand_name text;
  guest_flag boolean;
  proposed text;
BEGIN
  rand_name := beasts[1 + floor(random() * array_length(beasts,1))::int];
  guest_flag := coalesce((new.raw_user_meta_data->>'is_guest')::boolean, false)
                OR new.email IS NULL OR new.email = '';

  proposed := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name','')), '');
  -- 触发器会处理空、重名、超长

  INSERT INTO public.profiles(id, display_name, is_guest, last_active_at)
  VALUES (new.id, proposed, guest_flag, now());

  INSERT INTO public.pets(user_id, name, species)
  VALUES (new.id, rand_name, rand_name);

  RETURN new;
END;
$$;
